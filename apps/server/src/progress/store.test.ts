import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  coreMigrations,
  type HaleroDatabase,
  openDatabase,
  runMigrations,
} from "@halero/db";
import { readRange, upsertDailyCounts } from "./store";

const openMigrated = (): HaleroDatabase => {
  const dir = mkdtempSync(join(tmpdir(), "halero-progress-"));
  const handle = openDatabase(join(dir, "halero.db"));
  runMigrations(handle.sqlite, {
    migrations: coreMigrations,
    backupsDir: join(dir, "backups"),
  });
  return handle;
};

describe("activity store", () => {
  test("upserts a batch and reads it back ascending", () => {
    const { db, sqlite } = openMigrated();
    upsertDailyCounts(
      db,
      "github",
      [
        { date: "2026-06-02", count: 2 },
        { date: "2026-06-01", count: 1 },
      ],
      1000,
    );

    expect(readRange(db, "github", "2026-06-01", "2026-06-30")).toEqual([
      { date: "2026-06-01", count: 1 },
      { date: "2026-06-02", count: 2 },
    ]);
    sqlite.close();
  });

  test("re-upserting overlapping dates replaces counts, never doubles", () => {
    const { db, sqlite } = openMigrated();
    upsertDailyCounts(db, "github", [{ date: "2026-06-01", count: 1 }], 1000);
    upsertDailyCounts(db, "github", [{ date: "2026-06-01", count: 5 }], 2000);

    expect(readRange(db, "github", "2026-06-01", "2026-06-30")).toEqual([
      { date: "2026-06-01", count: 5 },
    ]);
    sqlite.close();
  });

  test("readRange respects the from/to bounds", () => {
    const { db, sqlite } = openMigrated();
    upsertDailyCounts(
      db,
      "github",
      [
        { date: "2026-05-31", count: 9 },
        { date: "2026-06-01", count: 1 },
        { date: "2026-06-15", count: 2 },
        { date: "2026-07-01", count: 9 },
      ],
      1000,
    );

    expect(readRange(db, "github", "2026-06-01", "2026-06-30")).toEqual([
      { date: "2026-06-01", count: 1 },
      { date: "2026-06-15", count: 2 },
    ]);
    sqlite.close();
  });

  test("keeps sources separate", () => {
    const { db, sqlite } = openMigrated();
    upsertDailyCounts(db, "github", [{ date: "2026-06-01", count: 1 }], 1000);
    upsertDailyCounts(db, "gitlab", [{ date: "2026-06-01", count: 7 }], 1000);

    expect(readRange(db, "github", "2026-06-01", "2026-06-30")).toEqual([
      { date: "2026-06-01", count: 1 },
    ]);
    sqlite.close();
  });
});
