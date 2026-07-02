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

/** Settings rows whose values carry secret material stay out entirely. */
const EXCLUDED_SETTING_KEYS: ReadonlySet<string> = new Set([
  "google_oauth_client_secret_enc",
  "oauth_state",
]);

type ExportRow = Record<string, unknown>;

/** Returns the row ready for export, or null when it must be skipped. */
const redactRow = (table: string, row: ExportRow): ExportRow | null => {
  if (table === "connections") {
    // Encrypted OAuth tokens: useless without this instance's key file
    // and not worth carrying around in a portable file.
    return { ...row, credentials_enc: null };
  }
  if (table === "settings" && EXCLUDED_SETTING_KEYS.has(String(row.key))) {
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
 * Streams the snapshot's rows line by line. The snapshot directory is
 * removed exactly once, whichever way the stream ends: fully drained,
 * cancelled mid-download, or errored.
 */
const createExportStream = (
  snapshotDir: string,
): ReadableStream<Uint8Array> => {
  const snapshot = new Database(join(snapshotDir, "snapshot.db"), {
    readonly: true,
  });
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
    try {
      createSnapshot(options.database.sqlite, join(snapshotDir, "snapshot.db"));
    } catch (error) {
      rmSync(snapshotDir, { recursive: true, force: true });
      throw error;
    }
    return c.body(createExportStream(snapshotDir), 200, {
      "content-type": "application/jsonl; charset=utf-8",
      "content-disposition": `attachment; filename=${exportFileName(options.now())}`,
    });
  });
  return routes;
};
