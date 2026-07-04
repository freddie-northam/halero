import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runMigrations } from "./migration-runner";
import { coreMigrations, type Migration } from "./migrations";
import { openDatabase } from "./open-database";

interface TestContext {
  readonly sqlite: Database;
  readonly backupsDir: string;
}

const makeContext = (): TestContext => {
  const dir = mkdtempSync(join(tmpdir(), "halero-db-"));
  const { sqlite } = openDatabase(join(dir, "halero.db"));
  return { sqlite, backupsDir: join(dir, "backups") };
};

const ledgerNames = (sqlite: Database): string[] =>
  sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM schema_migrations ORDER BY rowid",
    )
    .all()
    .map((row) => row.name);

const tableExists = (sqlite: Database, table: string): boolean =>
  sqlite
    .query<{ name: string }, [string]>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(table) !== null;

describe("runMigrations", () => {
  test("applies core migrations, records the ledger, and re-run is a no-op", () => {
    const { sqlite, backupsDir } = makeContext();

    const first = runMigrations(sqlite, {
      migrations: coreMigrations,
      backupsDir,
    });

    expect(first.applied).toEqual([
      "0001_core",
      "0002_connection_backoff",
      "0003_external_ref_streams",
      "0004_tasks",
      "0005_api_tokens",
      "0006_tasks_board",
      "0007_notes",
      "0008_calendar_event_notes_url",
      "0009_activity",
      "0009_f1",
    ]);
    expect(ledgerNames(sqlite)).toEqual([
      "0001_core",
      "0002_connection_backoff",
      "0003_external_ref_streams",
      "0004_tasks",
      "0005_api_tokens",
      "0006_tasks_board",
      "0007_notes",
      "0008_calendar_event_notes_url",
      "0009_activity",
      "0009_f1",
    ]);
    expect(tableExists(sqlite, "entities")).toBe(true);
    expect(tableExists(sqlite, "settings")).toBe(true);

    const second = runMigrations(sqlite, {
      migrations: coreMigrations,
      backupsDir,
    });

    expect(second.applied).toEqual([]);
    expect(second.snapshotPath).toBeNull();
    expect(ledgerNames(sqlite)).toEqual([
      "0001_core",
      "0002_connection_backoff",
      "0003_external_ref_streams",
      "0004_tasks",
      "0005_api_tokens",
      "0006_tasks_board",
      "0007_notes",
      "0008_calendar_event_notes_url",
      "0009_activity",
      "0009_f1",
    ]);
  });

  test("applies migrations ordered by numeric prefix even if the list is unordered", () => {
    const { sqlite, backupsDir } = makeContext();
    const migrations: Migration[] = [
      {
        name: "0002_seed_widgets",
        sql: "INSERT INTO widgets (id) VALUES ('w1');",
      },
      {
        name: "0001_widgets",
        sql: "CREATE TABLE widgets (id TEXT PRIMARY KEY);",
      },
    ];

    const result = runMigrations(sqlite, { migrations, backupsDir });

    expect(result.applied).toEqual(["0001_widgets", "0002_seed_widgets"]);
    expect(ledgerNames(sqlite)).toEqual(["0001_widgets", "0002_seed_widgets"]);
  });

  test("refuses to run when the ledger contains an unknown migration", () => {
    const { sqlite, backupsDir } = makeContext();
    runMigrations(sqlite, { migrations: coreMigrations, backupsDir });
    sqlite.run(
      "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
      ["9999_from_the_future", Date.now()],
    );

    expect(() =>
      runMigrations(sqlite, { migrations: coreMigrations, backupsDir }),
    ).toThrow(/newer version/);
    expect(() =>
      runMigrations(sqlite, { migrations: coreMigrations, backupsDir }),
    ).toThrow(/9999_from_the_future/);
  });

  test("the refusal message names the most recent snapshot when one exists", () => {
    const { sqlite, backupsDir } = makeContext();
    runMigrations(sqlite, { migrations: coreMigrations, backupsDir });
    mkdirSync(backupsDir, { recursive: true });
    const olderSnapshot = join(backupsDir, "pre-0001_core-100.db");
    const newerSnapshot = join(backupsDir, "pre-0002_next-200.db");
    writeFileSync(olderSnapshot, "old");
    writeFileSync(newerSnapshot, "new");
    utimesSync(olderSnapshot, new Date(1000), new Date(1000));
    utimesSync(newerSnapshot, new Date(2000), new Date(2000));
    sqlite.run(
      "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
      ["9999_from_the_future", Date.now()],
    );

    expect(() =>
      runMigrations(sqlite, { migrations: coreMigrations, backupsDir }),
    ).toThrow(newerSnapshot);
  });

  test("takes no snapshot for a brand-new empty database", () => {
    const { sqlite, backupsDir } = makeContext();

    const result = runMigrations(sqlite, {
      migrations: coreMigrations,
      backupsDir,
    });

    expect(result.snapshotPath).toBeNull();
    expect(existsSync(backupsDir)).toBe(false);
  });

  test("snapshots a non-empty database before applying pending migrations", () => {
    const { sqlite, backupsDir } = makeContext();
    runMigrations(sqlite, { migrations: coreMigrations, backupsDir });
    const extended: Migration[] = [
      ...coreMigrations,
      {
        name: "0007_widgets",
        sql: "CREATE TABLE widgets (id TEXT PRIMARY KEY);",
      },
    ];

    const result = runMigrations(sqlite, { migrations: extended, backupsDir });

    expect(result.applied).toEqual(["0007_widgets"]);
    if (result.snapshotPath === null) {
      throw new Error("expected a snapshot path");
    }
    expect(basename(result.snapshotPath)).toStartWith("pre-0007_widgets-");
    expect(existsSync(result.snapshotPath)).toBe(true);

    const snapshot = new Database(result.snapshotPath, { readonly: true });
    expect(ledgerNames(snapshot)).toEqual([
      "0001_core",
      "0002_connection_backoff",
      "0003_external_ref_streams",
      "0004_tasks",
      "0005_api_tokens",
      "0006_tasks_board",
      "0007_notes",
      "0008_calendar_event_notes_url",
      "0009_activity",
      "0009_f1",
    ]);
    expect(tableExists(snapshot, "widgets")).toBe(false);
    snapshot.close();
  });

  test("takes no snapshot when nothing is pending", () => {
    const { sqlite, backupsDir } = makeContext();
    runMigrations(sqlite, { migrations: coreMigrations, backupsDir });
    const extended: Migration[] = [
      ...coreMigrations,
      {
        name: "0002_widgets",
        sql: "CREATE TABLE widgets (id TEXT PRIMARY KEY);",
      },
    ];
    runMigrations(sqlite, { migrations: extended, backupsDir });
    const snapshotsBefore = readdirSync(backupsDir);

    const result = runMigrations(sqlite, { migrations: extended, backupsDir });

    expect(result.applied).toEqual([]);
    expect(result.snapshotPath).toBeNull();
    expect(readdirSync(backupsDir)).toEqual(snapshotsBefore);
  });

  test("0002_connection_backoff adds consecutive_failures defaulting to 0", () => {
    const { sqlite, backupsDir } = makeContext();
    const coreOnly = coreMigrations.filter(
      (migration) => migration.name === "0001_core",
    );
    runMigrations(sqlite, { migrations: coreOnly, backupsDir });
    // An existing connection row must pick up the default, and because
    // the database is non-empty the pre-migration snapshot must fire.
    sqlite.run(
      "INSERT INTO connections (id, connector_id, status, created_at) VALUES ('c1', 'google-calendar', 'active', 1)",
    );

    const result = runMigrations(sqlite, {
      migrations: coreMigrations,
      backupsDir,
    });

    expect(result.applied).toEqual([
      "0002_connection_backoff",
      "0003_external_ref_streams",
      "0004_tasks",
      "0005_api_tokens",
      "0006_tasks_board",
      "0007_notes",
      "0008_calendar_event_notes_url",
      "0009_activity",
      "0009_f1",
    ]);
    expect(result.snapshotPath).not.toBeNull();
    const row = sqlite
      .query<{ consecutive_failures: number }, []>(
        "SELECT consecutive_failures FROM connections WHERE id = 'c1'",
      )
      .get();
    expect(row?.consecutive_failures).toBe(0);
    sqlite.close();
  });

  test("0003_external_ref_streams backfills stream from the calendar satellite", () => {
    const { sqlite, backupsDir } = makeContext();
    const preStream = coreMigrations.filter(
      (migration) => migration.name !== "0003_external_ref_streams",
    );
    runMigrations(sqlite, { migrations: preStream, backupsDir });
    const insertEntity = (id: string): void => {
      sqlite.run(
        `INSERT INTO entities (id, kind, schema_version, source, created_at, updated_at)
         VALUES (?, 'calendar.event', 1, 'connector', 1, 1)`,
        [id],
      );
    };
    const insertRef = (externalId: string, entityId: string): void => {
      sqlite.run(
        `INSERT INTO external_refs (connector_id, account_key, external_id, entity_id, last_seen_at)
         VALUES ('google-calendar', 'sub-1', ?, ?, 1)`,
        [externalId, entityId],
      );
    };
    insertEntity("ent-1");
    sqlite.run(
      "INSERT INTO calendar_events (entity_id, calendar_id) VALUES ('ent-1', 'work')",
    );
    insertRef("evt-1", "ent-1");
    // A ref without a calendar satellite must stay NULL, not fail.
    insertEntity("ent-2");
    insertRef("evt-2", "ent-2");

    const result = runMigrations(sqlite, {
      migrations: coreMigrations,
      backupsDir,
    });

    expect(result.applied).toEqual(["0003_external_ref_streams"]);
    const streamOf = (externalId: string): string | null =>
      sqlite
        .query<{ stream: string | null }, [string]>(
          "SELECT stream FROM external_refs WHERE external_id = ?",
        )
        .get(externalId)?.stream ?? null;
    expect(streamOf("evt-1")).toBe("work");
    expect(streamOf("evt-2")).toBeNull();
    sqlite.close();
  });

  test("0004_tasks creates the tasks table and snapshots a non-empty database", () => {
    const { sqlite, backupsDir } = makeContext();
    // 0006 rebuilds the tasks table, so it must stay out of the first
    // run alongside 0004.
    const preTasks = coreMigrations.filter(
      (migration) =>
        migration.name !== "0004_tasks" &&
        migration.name !== "0006_tasks_board",
    );
    runMigrations(sqlite, { migrations: preTasks, backupsDir });
    // Any pre-existing row makes the database non-empty, so the
    // pre-migration snapshot must fire.
    sqlite.run(
      `INSERT INTO entities (id, kind, schema_version, source, created_at, updated_at)
       VALUES ('ent-1', 'note', 1, 'user', 1, 1)`,
    );

    const result = runMigrations(sqlite, {
      migrations: coreMigrations,
      backupsDir,
    });

    expect(result.applied).toEqual(["0004_tasks", "0006_tasks_board"]);
    expect(result.snapshotPath).not.toBeNull();
    expect(tableExists(sqlite, "tasks")).toBe(true);
    sqlite.close();
  });

  test("0006_tasks_board accepts the board statuses and rejects others, including legacy 'open'", () => {
    const { sqlite, backupsDir } = makeContext();
    runMigrations(sqlite, { migrations: coreMigrations, backupsDir });
    const insertEntity = (id: string): void => {
      sqlite.run(
        `INSERT INTO entities (id, kind, schema_version, source, created_at, updated_at)
         VALUES (?, 'task.item', 1, 'user', 1, 1)`,
        [id],
      );
    };
    const insertTask = (entityId: string, status: string): void => {
      sqlite.run("INSERT INTO tasks (entity_id, status) VALUES (?, ?)", [
        entityId,
        status,
      ]);
    };
    for (const id of ["ent-1", "ent-2", "ent-3", "ent-4"]) {
      insertEntity(id);
    }

    insertTask("ent-1", "todo");
    insertTask("ent-2", "doing");
    insertTask("ent-3", "done");
    expect(() => insertTask("ent-4", "open")).toThrow(/CHECK/);
    expect(() => insertTask("ent-4", "archived")).toThrow(/CHECK/);
    sqlite.close();
  });

  test("0006_tasks_board enforces the priority CHECK", () => {
    const { sqlite, backupsDir } = makeContext();
    runMigrations(sqlite, { migrations: coreMigrations, backupsDir });
    const insertEntity = (id: string): void => {
      sqlite.run(
        `INSERT INTO entities (id, kind, schema_version, source, created_at, updated_at)
         VALUES (?, 'task.item', 1, 'user', 1, 1)`,
        [id],
      );
    };
    const insertPriority = (entityId: string, priority: string): void => {
      sqlite.run("INSERT INTO tasks (entity_id, priority) VALUES (?, ?)", [
        entityId,
        priority,
      ]);
    };
    for (const id of ["ent-1", "ent-2", "ent-3", "ent-4"]) {
      insertEntity(id);
    }

    insertPriority("ent-1", "high");
    insertPriority("ent-2", "medium");
    insertPriority("ent-3", "low");
    expect(() => insertPriority("ent-4", "urgent")).toThrow(/CHECK/);
    // NULL priority is allowed: the column has no NOT NULL.
    sqlite.run("INSERT INTO tasks (entity_id) VALUES ('ent-4')");
    sqlite.close();
  });

  test("0006_tasks_board applies the new defaults and indexes", () => {
    const { sqlite, backupsDir } = makeContext();
    runMigrations(sqlite, { migrations: coreMigrations, backupsDir });
    sqlite.run(
      `INSERT INTO entities (id, kind, schema_version, source, created_at, updated_at)
       VALUES ('ent-1', 'task.item', 1, 'user', 1, 1)`,
    );
    sqlite.run("INSERT INTO tasks (entity_id) VALUES ('ent-1')");

    const row = sqlite
      .query<
        {
          status: string;
          priority: string | null;
          tags: string | null;
          estimate_minutes: number | null;
          logged_minutes: number;
          sort_order: number;
        },
        []
      >(
        `SELECT status, priority, tags, estimate_minutes, logged_minutes, sort_order
         FROM tasks WHERE entity_id = 'ent-1'`,
      )
      .get();
    expect(row).toEqual({
      status: "todo",
      priority: null,
      tags: null,
      estimate_minutes: null,
      logged_minutes: 0,
      sort_order: 0,
    });

    const indexNames = sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'tasks' ORDER BY name",
      )
      .all()
      .map((indexRow) => indexRow.name);
    expect(indexNames).toContain("idx_tasks_status_due");
    expect(indexNames).toContain("idx_tasks_status_sort");
    sqlite.close();
  });

  test("0006_tasks_board remaps legacy statuses and preserves rows across the rebuild", () => {
    const { sqlite, backupsDir } = makeContext();
    // First bring the database to the v0.2 shape (through 0005), seed
    // legacy tasks, then let a second run apply only 0006.
    const preBoard = coreMigrations.filter(
      (migration) => migration.name !== "0006_tasks_board",
    );
    runMigrations(sqlite, { migrations: preBoard, backupsDir });
    const insertEntity = (id: string): void => {
      sqlite.run(
        `INSERT INTO entities (id, kind, schema_version, source, created_at, updated_at)
         VALUES (?, 'task.item', 1, 'user', 1, 1)`,
        [id],
      );
    };
    insertEntity("ent-open");
    insertEntity("ent-done");
    sqlite.run(
      `INSERT INTO tasks (entity_id, status, due_date, completed_at, notes)
       VALUES ('ent-open', 'open', '2026-07-10', NULL, 'Renew passport')`,
    );
    sqlite.run(
      `INSERT INTO tasks (entity_id, status, due_date, completed_at, notes)
       VALUES ('ent-done', 'done', '2026-06-01', 1700000000000, 'Shipped')`,
    );

    const result = runMigrations(sqlite, {
      migrations: coreMigrations,
      backupsDir,
    });

    expect(result.applied).toEqual(["0006_tasks_board"]);
    expect(result.snapshotPath).not.toBeNull();

    interface RebuiltRow {
      entity_id: string;
      status: string;
      due_date: string | null;
      completed_at: number | null;
      notes: string | null;
      logged_minutes: number;
      sort_order: number;
    }
    const rows = sqlite
      .query<RebuiltRow, []>(
        `SELECT entity_id, status, due_date, completed_at, notes, logged_minutes, sort_order
         FROM tasks ORDER BY sort_order`,
      )
      .all();
    expect(rows).toEqual([
      {
        entity_id: "ent-open",
        status: "todo",
        due_date: "2026-07-10",
        completed_at: null,
        notes: "Renew passport",
        logged_minutes: 0,
        sort_order: 1,
      },
      {
        entity_id: "ent-done",
        status: "done",
        due_date: "2026-06-01",
        completed_at: 1700000000000,
        notes: "Shipped",
        logged_minutes: 0,
        sort_order: 2,
      },
    ]);

    // The rebuild must not orphan the entity_id foreign keys.
    const joined = sqlite
      .query<{ total: number }, []>(
        `SELECT count(*) AS total FROM tasks
         INNER JOIN entities ON entities.id = tasks.entity_id`,
      )
      .get();
    expect(joined?.total).toBe(2);
    expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    sqlite.close();
  });

  test("the rebuilt tasks table still enforces the foreign key to entities", () => {
    const { sqlite, backupsDir } = makeContext();
    runMigrations(sqlite, { migrations: coreMigrations, backupsDir });

    expect(() =>
      sqlite.run(
        "INSERT INTO tasks (entity_id, status) VALUES ('missing-entity', 'todo')",
      ),
    ).toThrow(/FOREIGN KEY/);
    sqlite.close();
  });

  test("0005_api_tokens creates the api_tokens table and snapshots a non-empty database", () => {
    const { sqlite, backupsDir } = makeContext();
    const preApiTokens = coreMigrations.filter(
      (migration) => migration.name !== "0005_api_tokens",
    );
    runMigrations(sqlite, { migrations: preApiTokens, backupsDir });
    // Any pre-existing row makes the database non-empty, so the
    // pre-migration snapshot must fire.
    sqlite.run(
      `INSERT INTO entities (id, kind, schema_version, source, created_at, updated_at)
       VALUES ('ent-1', 'note', 1, 'user', 1, 1)`,
    );

    const result = runMigrations(sqlite, {
      migrations: coreMigrations,
      backupsDir,
    });

    expect(result.applied).toEqual(["0005_api_tokens"]);
    expect(result.snapshotPath).not.toBeNull();
    expect(tableExists(sqlite, "api_tokens")).toBe(true);
    sqlite.close();
  });

  test("0005_api_tokens enforces UNIQUE token_hash", () => {
    const { sqlite, backupsDir } = makeContext();
    runMigrations(sqlite, { migrations: coreMigrations, backupsDir });
    const insertToken = (id: string): void => {
      sqlite.run(
        "INSERT INTO api_tokens (id, name, token_hash, created_at) VALUES (?, 'Raycast', 'same-hash', 1)",
        [id],
      );
    };
    insertToken("tok-1");

    expect(() => insertToken("tok-2")).toThrow(/UNIQUE/);
    sqlite.close();
  });

  test("0007_notes creates the notes table and snapshots a non-empty database", () => {
    const { sqlite, backupsDir } = makeContext();
    const preNotes = coreMigrations.filter(
      (migration) => migration.name !== "0007_notes",
    );
    runMigrations(sqlite, { migrations: preNotes, backupsDir });
    // Any pre-existing row makes the database non-empty, so the
    // pre-migration snapshot must fire.
    sqlite.run(
      `INSERT INTO entities (id, kind, schema_version, source, created_at, updated_at)
       VALUES ('ent-1', 'note.item', 1, 'user', 1, 1)`,
    );

    const result = runMigrations(sqlite, {
      migrations: coreMigrations,
      backupsDir,
    });

    expect(result.applied).toEqual(["0007_notes"]);
    expect(result.snapshotPath).not.toBeNull();
    expect(tableExists(sqlite, "notes")).toBe(true);
    sqlite.close();
  });

  test("0007_notes stores a document with nullable tags and requires a document", () => {
    const { sqlite, backupsDir } = makeContext();
    runMigrations(sqlite, { migrations: coreMigrations, backupsDir });
    sqlite.run(
      `INSERT INTO entities (id, kind, schema_version, source, created_at, updated_at)
       VALUES ('ent-1', 'note.item', 1, 'user', 1, 1)`,
    );

    sqlite.run(
      "INSERT INTO notes (entity_id, document, tags) VALUES ('ent-1', '[]', NULL)",
    );
    const row = sqlite
      .query<{ document: string; tags: string | null }, []>(
        "SELECT document, tags FROM notes WHERE entity_id = 'ent-1'",
      )
      .get();
    expect(row).toEqual({ document: "[]", tags: null });

    // document is NOT NULL.
    sqlite.run(
      `INSERT INTO entities (id, kind, schema_version, source, created_at, updated_at)
       VALUES ('ent-2', 'note.item', 1, 'user', 1, 1)`,
    );
    expect(() =>
      sqlite.run("INSERT INTO notes (entity_id) VALUES ('ent-2')"),
    ).toThrow(/NOT NULL/);
    sqlite.close();
  });

  test("0007_notes enforces the foreign key to entities", () => {
    const { sqlite, backupsDir } = makeContext();
    runMigrations(sqlite, { migrations: coreMigrations, backupsDir });

    expect(() =>
      sqlite.run(
        "INSERT INTO notes (entity_id, document) VALUES ('missing-entity', '[]')",
      ),
    ).toThrow(/FOREIGN KEY/);
    sqlite.close();
  });

  test("rolls back a failed migration, keeps it out of the ledger, and stops", () => {
    const { sqlite, backupsDir } = makeContext();
    runMigrations(sqlite, { migrations: coreMigrations, backupsDir });
    const broken: Migration = {
      name: "0007_broken",
      sql: [
        "CREATE TABLE widgets (id TEXT PRIMARY KEY);",
        "CREATE TABLE widgets (id TEXT PRIMARY KEY);",
      ].join("\n"),
    };
    const afterBroken: Migration = {
      name: "0008_never_reached",
      sql: "CREATE TABLE gadgets (id TEXT PRIMARY KEY);",
    };

    expect(() =>
      runMigrations(sqlite, {
        migrations: [...coreMigrations, broken, afterBroken],
        backupsDir,
      }),
    ).toThrow(/0007_broken/);

    expect(tableExists(sqlite, "widgets")).toBe(false);
    expect(tableExists(sqlite, "gadgets")).toBe(false);
    expect(ledgerNames(sqlite)).toEqual([
      "0001_core",
      "0002_connection_backoff",
      "0003_external_ref_streams",
      "0004_tasks",
      "0005_api_tokens",
      "0006_tasks_board",
      "0007_notes",
      "0008_calendar_event_notes_url",
      "0009_activity",
      "0009_f1",
    ]);
  });
});
