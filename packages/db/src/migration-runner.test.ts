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

    expect(first.applied).toEqual(["0001_core", "0002_connection_backoff"]);
    expect(ledgerNames(sqlite)).toEqual([
      "0001_core",
      "0002_connection_backoff",
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
        name: "0003_widgets",
        sql: "CREATE TABLE widgets (id TEXT PRIMARY KEY);",
      },
    ];

    const result = runMigrations(sqlite, { migrations: extended, backupsDir });

    expect(result.applied).toEqual(["0003_widgets"]);
    if (result.snapshotPath === null) {
      throw new Error("expected a snapshot path");
    }
    expect(basename(result.snapshotPath)).toStartWith("pre-0003_widgets-");
    expect(existsSync(result.snapshotPath)).toBe(true);

    const snapshot = new Database(result.snapshotPath, { readonly: true });
    expect(ledgerNames(snapshot)).toEqual([
      "0001_core",
      "0002_connection_backoff",
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

    expect(result.applied).toEqual(["0002_connection_backoff"]);
    expect(result.snapshotPath).not.toBeNull();
    const row = sqlite
      .query<{ consecutive_failures: number }, []>(
        "SELECT consecutive_failures FROM connections WHERE id = 'c1'",
      )
      .get();
    expect(row?.consecutive_failures).toBe(0);
    sqlite.close();
  });

  test("rolls back a failed migration, keeps it out of the ledger, and stops", () => {
    const { sqlite, backupsDir } = makeContext();
    runMigrations(sqlite, { migrations: coreMigrations, backupsDir });
    const broken: Migration = {
      name: "0003_broken",
      sql: [
        "CREATE TABLE widgets (id TEXT PRIMARY KEY);",
        "CREATE TABLE widgets (id TEXT PRIMARY KEY);",
      ].join("\n"),
    };
    const afterBroken: Migration = {
      name: "0004_never_reached",
      sql: "CREATE TABLE gadgets (id TEXT PRIMARY KEY);",
    };

    expect(() =>
      runMigrations(sqlite, {
        migrations: [...coreMigrations, broken, afterBroken],
        backupsDir,
      }),
    ).toThrow(/0003_broken/);

    expect(tableExists(sqlite, "widgets")).toBe(false);
    expect(tableExists(sqlite, "gadgets")).toBe(false);
    expect(ledgerNames(sqlite)).toEqual([
      "0001_core",
      "0002_connection_backoff",
    ]);
  });
});
