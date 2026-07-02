import type { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "./migration-runner";
import { coreMigrations } from "./migrations";
import { openDatabase } from "./open-database";

const openMigrated = (): Database => {
  const dir = mkdtempSync(join(tmpdir(), "halero-db-"));
  const { sqlite } = openDatabase(join(dir, "halero.db"));
  runMigrations(sqlite, {
    migrations: coreMigrations,
    backupsDir: join(dir, "backups"),
  });
  return sqlite;
};

const insertEntity = (
  sqlite: Database,
  id: string,
  title: string,
  snippet: string | null,
): void => {
  sqlite.run(
    `INSERT INTO entities (id, kind, schema_version, title, snippet, source, created_at, updated_at)
     VALUES (?, 'note', 1, ?, ?, 'user', 1, 1)`,
    [id, title, snippet],
  );
};

const matchIds = (sqlite: Database, term: string): string[] =>
  sqlite
    .query<{ id: string }, [string]>(
      `SELECT id FROM entities
       WHERE rowid IN (SELECT rowid FROM entities_fts WHERE entities_fts MATCH ?)
       ORDER BY id`,
    )
    .all(term)
    .map((row) => row.id);

describe("entities_fts triggers", () => {
  test("an inserted entity is searchable by title and snippet", () => {
    const sqlite = openMigrated();
    insertEntity(
      sqlite,
      "e1",
      "Quarterly planning",
      "budget review with finance",
    );

    expect(matchIds(sqlite, "planning")).toEqual(["e1"]);
    expect(matchIds(sqlite, "finance")).toEqual(["e1"]);
    sqlite.close();
  });

  test("an updated entity is searchable by the new text only", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "e1", "Quarterly planning", null);

    sqlite.run(
      "UPDATE entities SET title = 'Annual retrospective' WHERE id = 'e1'",
    );

    expect(matchIds(sqlite, "retrospective")).toEqual(["e1"]);
    expect(matchIds(sqlite, "planning")).toEqual([]);
    sqlite.close();
  });

  test("a soft-deleted entity drops out of search results", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "e1", "Quarterly planning", null);

    sqlite.run("UPDATE entities SET deleted_at = 123 WHERE id = 'e1'");

    expect(matchIds(sqlite, "planning")).toEqual([]);
    sqlite.close();
  });

  test("a restored entity becomes searchable again", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "e1", "Quarterly planning", null);
    sqlite.run("UPDATE entities SET deleted_at = 123 WHERE id = 'e1'");

    sqlite.run("UPDATE entities SET deleted_at = NULL WHERE id = 'e1'");

    expect(matchIds(sqlite, "planning")).toEqual(["e1"]);
    sqlite.close();
  });

  test("a hard-deleted entity drops out of search results", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "e1", "Quarterly planning", null);
    insertEntity(sqlite, "e2", "Weekly planning", null);

    sqlite.run("DELETE FROM entities WHERE id = 'e1'");

    expect(matchIds(sqlite, "planning")).toEqual(["e2"]);
    sqlite.close();
  });

  test("hard-deleting an already soft-deleted entity keeps search working", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "e1", "Quarterly planning", null);
    insertEntity(sqlite, "e2", "Weekly planning", null);
    sqlite.run("UPDATE entities SET deleted_at = 123 WHERE id = 'e1'");

    sqlite.run("DELETE FROM entities WHERE id = 'e1'");

    expect(matchIds(sqlite, "planning")).toEqual(["e2"]);
    sqlite.close();
  });
});
