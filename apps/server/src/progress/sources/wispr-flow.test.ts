import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActivitySourceContext } from "../source";
import { wisprFlowSource } from "./wispr-flow";

// Builds a context for the local Wispr Flow source. db/key/fetch/now are
// unused by this source, so they are harmless stubs.
const makeContext = (
  homeDir: string,
  today: string,
): ActivitySourceContext => ({
  db: undefined as unknown as ActivitySourceContext["db"],
  key: new Uint8Array(0),
  fetch: (() =>
    Promise.reject(new Error("no network"))) as ActivitySourceContext["fetch"],
  now: () => 0,
  today,
  homeTimezone: "UTC",
  homeDir,
});

// Creates the nested Application Support directory and a flow.sqlite there,
// mirroring the layout the real app uses, then closes the write handle so the
// source can reopen it read-only.
const writeHistory = (
  homeDir: string,
  timestamps: readonly (string | null)[],
): void => {
  const dir = join(homeDir, "Library", "Application Support", "Wispr Flow");
  mkdirSync(dir, { recursive: true });
  const db = new Database(join(dir, "flow.sqlite"));
  db.run("CREATE TABLE History (transcriptEntityId TEXT, timestamp TEXT)");
  const insert = db.prepare(
    "INSERT INTO History (transcriptEntityId, timestamp) VALUES (?, ?)",
  );
  timestamps.forEach((timestamp, index) => {
    insert.run(`entity-${index}`, timestamp);
  });
  db.close();
};

describe("wisprFlowSource", () => {
  test("buckets dictations per day, skipping out-of-window and null rows", async () => {
    const today = "2026-07-03";
    const homeDir = mkdtempSync(join(tmpdir(), "halero-wispr-"));
    writeHistory(homeDir, [
      "2026-07-02 10:00:00.000 +00:00",
      "2026-07-02 14:30:00.500 +00:00",
      "2026-07-03 00:51:24.619 +00:00",
      "2024-01-01 09:00:00.000 +00:00",
      null,
    ]);

    const data = await wisprFlowSource.readDaily(makeContext(homeDir, today));

    expect(data).not.toBeNull();
    expect(data?.accountLabel).toBeNull();
    expect(data?.days).toEqual([
      { date: "2026-07-02", count: 2 },
      { date: "2026-07-03", count: 1 },
    ]);
    expect(data?.total).toBe(3);
  });

  test("returns null when flow.sqlite does not exist", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "halero-wispr-empty-"));

    const data = await wisprFlowSource.readDaily(
      makeContext(homeDir, "2026-07-03"),
    );

    expect(data).toBeNull();
  });
});
