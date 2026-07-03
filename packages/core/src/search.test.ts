import type { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coreMigrations, openDatabase, runMigrations } from "@halero/db";
import {
  HIGHLIGHT_END,
  HIGHLIGHT_START,
  searchEntities,
  toFtsQuery,
} from "./search";
import { HOSTILE_SEARCH_INPUTS } from "./testing";

const openMigrated = (): Database => {
  const dir = mkdtempSync(join(tmpdir(), "halero-search-"));
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
  title: string | null,
  snippet: string | null,
  kind = "note",
  occurredStart: number | null = null,
): void => {
  sqlite.run(
    `INSERT INTO entities (id, kind, schema_version, title, snippet, occurred_start, source, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?, ?, 'user', 1, 1)`,
    [id, kind, title, snippet, occurredStart],
  );
};

describe("toFtsQuery", () => {
  test("quotes plain words with a prefix star, joined by spaces", () => {
    expect(toFtsQuery("hello world")).toBe('"hello"* "world"*');
  });

  test("preserves case as typed", () => {
    expect(toFtsQuery("Hello WORLD")).toBe('"Hello"* "WORLD"*');
  });

  test("trims surrounding whitespace and collapses runs between tokens", () => {
    expect(toFtsQuery("  hello   world  ")).toBe('"hello"* "world"*');
  });

  test("caps at 8 tokens", () => {
    const query = toFtsQuery("a b c d e f g h i j");
    expect(query).toBe('"a"* "b"* "c"* "d"* "e"* "f"* "g"* "h"*');
  });

  test("escapes double quotes by doubling them", () => {
    expect(toFtsQuery('"foo" OR "bar')).toBe('"""foo"""* "OR"* """bar"*');
  });

  test("neutralizes NEAR by quoting each token", () => {
    expect(toFtsQuery("NEAR(a b)")).toBe('"NEAR(a"* "b)"*');
  });

  test("neutralizes column filters", () => {
    expect(toFtsQuery("title:secret")).toBe('"title:secret"*');
  });

  test("neutralizes AND by quoting it as a plain token", () => {
    expect(toFtsQuery("a AND b")).toBe('"a"* "AND"* "b"*');
  });

  test("neutralizes a leading NOT-style dash", () => {
    expect(toFtsQuery("-neg")).toBe('"-neg"*');
  });

  test("neutralizes an unbalanced parenthesis", () => {
    expect(toFtsQuery("(paren")).toBe('"(paren"*');
  });

  test("neutralizes a star inside a token", () => {
    expect(toFtsQuery("star*mid")).toBe('"star*mid"*');
  });

  test("neutralizes a caret", () => {
    expect(toFtsQuery("^caret")).toBe('"^caret"*');
  });

  test("passes emoji and accented unicode through quoted", () => {
    expect(toFtsQuery("café 🚀")).toBe('"café"* "🚀"*');
  });

  test("strips NUL bytes that would truncate the C string FTS5 parses", () => {
    expect(toFtsQuery("foo\u0000bar")).toBe('"foo"* "bar"*');
    expect(toFtsQuery("\u0000")).toBeNull();
    expect(toFtsQuery("a \u0000 b")).toBe('"a"* "b"*');
    expect(toFtsQuery("plan\u0000")).toBe('"plan"*');
  });

  test("strips the full C0 range including the highlight markers", () => {
    expect(toFtsQuery("x\u0001spoof\u0002")).toBe('"x"* "spoof"*');
    expect(toFtsQuery("\u0007\u000b\u001f")).toBeNull();
  });

  test("returns null for empty input", () => {
    expect(toFtsQuery("")).toBeNull();
  });

  test("returns null for whitespace-only input", () => {
    expect(toFtsQuery(" \t\n  ")).toBeNull();
  });
});

describe("searchEntities", () => {
  test("matches prefixes as-you-type", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "e1", "Planning session", null);

    const hits = searchEntities(sqlite, { query: "plan" });

    expect(hits.map((h) => h.entityId)).toEqual(["e1"]);
    sqlite.close();
  });

  test("returns the spine fields on each hit", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "e1", "Planning session", "budget review", "note", 42);

    const hits = searchEntities(sqlite, { query: "plan" });

    expect(hits).toHaveLength(1);
    const hit = hits[0];
    expect(hit?.entityId).toBe("e1");
    expect(hit?.kind).toBe("note");
    expect(hit?.title).toBe("Planning session");
    expect(hit?.occurredStart).toBe(42);
    sqlite.close();
  });

  test("ranks a title match above a snippet-only match", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "snippet-only", "Meeting notes", "discussed budget");
    insertEntity(sqlite, "title-hit", "Budget overview", "quarterly numbers");

    const hits = searchEntities(sqlite, { query: "budget" });

    expect(hits.map((h) => h.entityId)).toEqual(["title-hit", "snippet-only"]);
    sqlite.close();
  });

  test("excludes tombstoned entities and finds them again after restore", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "e1", "Planning session", null);

    sqlite.run("UPDATE entities SET deleted_at = 123 WHERE id = 'e1'");
    expect(searchEntities(sqlite, { query: "plan" })).toEqual([]);

    sqlite.run("UPDATE entities SET deleted_at = NULL WHERE id = 'e1'");
    expect(
      searchEntities(sqlite, { query: "plan" }).map((h) => h.entityId),
    ).toEqual(["e1"]);
    sqlite.close();
  });

  test("filters by kind when given", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "n1", "Planning notes", null, "note");
    insertEntity(sqlite, "c1", "Planning session", null, "calendar_event");

    const hits = searchEntities(sqlite, {
      query: "plan",
      kind: "calendar_event",
    });

    expect(hits.map((h) => h.entityId)).toEqual(["c1"]);
    sqlite.close();
  });

  test("defaults to 20 results and clamps the limit at 50", () => {
    const sqlite = openMigrated();
    for (let i = 0; i < 60; i++) {
      insertEntity(sqlite, `e${i}`, `Planning item ${i}`, null);
    }

    expect(searchEntities(sqlite, { query: "plan" })).toHaveLength(20);
    expect(searchEntities(sqlite, { query: "plan", limit: 500 })).toHaveLength(
      50,
    );
    expect(searchEntities(sqlite, { query: "plan", limit: 5 })).toHaveLength(5);
    sqlite.close();
  });

  test("wraps the matched token in highlight markers", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "e1", "Planning session", null);

    const hits = searchEntities(sqlite, { query: "plan" });

    expect(hits[0]?.titleHighlighted).toBe(
      `${HIGHLIGHT_START}Planning${HIGHLIGHT_END} session`,
    );
    sqlite.close();
  });

  test("marks snippet matches and returns null when there is no snippet", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "with", "Meeting notes", "the budget review");
    insertEntity(sqlite, "without", "Budget overview", null);

    const hits = searchEntities(sqlite, { query: "budget" });

    const withSnippet = hits.find((h) => h.entityId === "with");
    const withoutSnippet = hits.find((h) => h.entityId === "without");
    expect(withSnippet?.snippetHighlighted).toBe(
      `the ${HIGHLIGHT_START}budget${HIGHLIGHT_END} review`,
    );
    expect(withoutSnippet?.snippetHighlighted).toBeNull();
    sqlite.close();
  });

  test("requires every token to match (implicit AND)", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "both", "alpha beta", null);
    insertEntity(sqlite, "one", "alpha gamma", null);

    const hits = searchEntities(sqlite, { query: "alp bet" });

    expect(hits.map((h) => h.entityId)).toEqual(["both"]);
    sqlite.close();
  });

  test("treats OR as a literal token, not an operator", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "f", "foo item", null);
    insertEntity(sqlite, "b", "bar item", null);

    expect(searchEntities(sqlite, { query: "foo OR bar" })).toEqual([]);
    sqlite.close();
  });

  test("treats a column filter as literal text, not a filter", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "e1", "secret roadmap", null);

    expect(searchEntities(sqlite, { query: "title:secret" })).toEqual([]);
    sqlite.close();
  });

  test("never throws on hostile input", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "e1", "Planning session", "budget review");

    for (const raw of HOSTILE_SEARCH_INPUTS) {
      expect(() => searchEntities(sqlite, { query: raw })).not.toThrow();
    }
    sqlite.close();
  });

  test("returns [] for empty and whitespace-only queries", () => {
    const sqlite = openMigrated();
    insertEntity(sqlite, "e1", "Planning session", null);

    expect(searchEntities(sqlite, { query: "" })).toEqual([]);
    expect(searchEntities(sqlite, { query: "   " })).toEqual([]);
    sqlite.close();
  });
});
