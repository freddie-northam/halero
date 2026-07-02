// Full-data export as one streamed JSON Lines file. The rows are read
// from a VACUUM INTO snapshot, never via long SELECTs on the live
// database (live-copying a WAL SQLite file is how exports corrupt), and
// every secret-bearing field is redacted before a byte leaves the
// process.

import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSnapshot, type HaleroDatabase } from "@halero/db";
import { Hono } from "hono";
import type { AppEnv } from "./middleware/session";

const SIGN_IN_MESSAGE = "You need to sign in before exporting your data.";

/**
 * The portability contract: these tables, one JSON line per row, IDs
 * (ULIDs) untouched. sessions is deliberately absent; live login tokens
 * must never leave the instance.
 */
const EXPORTED_TABLES = [
  "entities",
  "calendar_events",
  "links",
  "entity_aliases",
  "connections",
  "external_refs",
  "sync_cursors",
  "sync_runs",
  "settings",
  "schema_migrations",
] as const;

/**
 * Settings export through an ALLOWLIST, never a denylist: a denylist
 * fails open, silently leaking every future key (the password hash and
 * notify_url already slipped through it). Any key not named here stays
 * private until it is deliberately added.
 */
const EXPORTED_SETTING_KEYS: ReadonlySet<string> = new Set([
  "setup_complete",
  "home_timezone",
  "base_url",
]);

type ExportRow = Record<string, unknown>;

/** Returns the row ready for export, or null when it must be skipped. */
const redactRow = (table: string, row: ExportRow): ExportRow | null => {
  if (table === "connections") {
    // Encrypted OAuth tokens: useless without this instance's key file
    // and not worth carrying around in a portable file.
    return { ...row, credentials_enc: null };
  }
  if (table === "settings" && !EXPORTED_SETTING_KEYS.has(String(row.key))) {
    return null;
  }
  return row;
};

function* exportLines(snapshot: Database): Generator<string> {
  for (const table of EXPORTED_TABLES) {
    // Table names come from the fixed list above, never from input.
    const statement = snapshot.query<ExportRow, []>(`SELECT * FROM ${table}`);
    for (const raw of statement.iterate()) {
      const row = redactRow(table, raw);
      if (row !== null) {
        yield `${JSON.stringify({ table, row })}\n`;
      }
    }
  }
}

/**
 * Snapshots the live database into snapshotDir and opens the copy.
 * Any failure (including the open) removes the temp directory before
 * rethrowing, so a failed export never leaks files.
 */
const openExportSnapshot = (
  live: HaleroDatabase,
  snapshotDir: string,
): Database => {
  try {
    const path = join(snapshotDir, "snapshot.db");
    createSnapshot(live.sqlite, path);
    return new Database(path, { readonly: true });
  } catch (error) {
    rmSync(snapshotDir, { recursive: true, force: true });
    throw error;
  }
};

/**
 * Streams the snapshot's rows line by line. The snapshot directory is
 * removed exactly once, whichever way the stream ends: fully drained,
 * cancelled mid-download, or errored.
 */
const createExportStream = (
  snapshot: Database,
  snapshotDir: string,
): ReadableStream<Uint8Array> => {
  const lines = exportLines(snapshot);
  const encoder = new TextEncoder();
  let finished = false;
  const cleanup = (): void => {
    if (finished) {
      return;
    }
    finished = true;
    snapshot.close();
    rmSync(snapshotDir, { recursive: true, force: true });
  };
  return new ReadableStream<Uint8Array>({
    pull: (controller) => {
      try {
        const step = lines.next();
        if (step.done === true) {
          cleanup();
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(step.value));
      } catch (error) {
        cleanup();
        controller.error(error);
      }
    },
    cancel: cleanup,
  });
};

const exportFileName = (at: number): string =>
  `halero-export-${new Date(at).toISOString().slice(0, 10)}.jsonl`;

export interface ExportRoutesOptions {
  readonly database: HaleroDatabase;
  readonly now: () => number;
  /** Parent directory for export snapshots; tests inject to observe. */
  readonly snapshotDir?: string;
}

export const createExportRoutes = (
  options: ExportRoutesOptions,
): Hono<AppEnv> => {
  const routes = new Hono<AppEnv>();
  routes.get("/", (c) => {
    if (c.get("session") === null) {
      return c.json({ error: SIGN_IN_MESSAGE }, 401);
    }
    const snapshotDir = mkdtempSync(
      join(options.snapshotDir ?? tmpdir(), "halero-export-"),
    );
    const snapshot = openExportSnapshot(options.database, snapshotDir);
    return c.body(createExportStream(snapshot, snapshotDir), 200, {
      "content-type": "application/jsonl; charset=utf-8",
      "content-disposition": `attachment; filename=${exportFileName(options.now())}`,
    });
  });
  return routes;
};
