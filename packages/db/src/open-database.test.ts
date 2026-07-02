import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { openDatabase } from "./open-database";

const makeDbPath = (): string =>
  join(mkdtempSync(join(tmpdir(), "halero-db-")), "halero.db");

describe("openDatabase", () => {
  test("applies the required pragmas", () => {
    const { sqlite } = openDatabase(makeDbPath());

    expect(sqlite.query("PRAGMA journal_mode").get()).toEqual({
      journal_mode: "wal",
    });
    expect(sqlite.query("PRAGMA synchronous").get()).toEqual({
      synchronous: 1,
    });
    expect(sqlite.query("PRAGMA foreign_keys").get()).toEqual({
      foreign_keys: 1,
    });
    expect(sqlite.query("PRAGMA busy_timeout").get()).toEqual({
      timeout: 5000,
    });

    sqlite.close();
  });

  test("returns a Drizzle instance bound to the same database", () => {
    const { sqlite, db } = openDatabase(makeDbPath());
    sqlite.exec(
      "CREATE TABLE probe (id TEXT PRIMARY KEY); INSERT INTO probe (id) VALUES ('p1');",
    );

    const rows = db.values<[string]>(sql`SELECT id FROM probe`);

    expect(rows).toEqual([["p1"]]);
    sqlite.close();
  });
});
