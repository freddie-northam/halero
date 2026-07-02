import type { Database } from "bun:sqlite";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Migration } from "./migrations";
import { createSnapshot } from "./snapshot";

export interface RunMigrationsOptions {
  readonly migrations: readonly Migration[];
  readonly backupsDir: string;
}

export interface RunMigrationsResult {
  readonly applied: readonly string[];
  readonly snapshotPath: string | null;
}

const numericPrefix = (name: string): number => {
  const prefix = Number.parseInt(name, 10);
  return Number.isNaN(prefix) ? Number.MAX_SAFE_INTEGER : prefix;
};

const byNumericPrefix = (a: Migration, b: Migration): number =>
  numericPrefix(a.name) - numericPrefix(b.name) || a.name.localeCompare(b.name);

const countSchemaObjects = (sqlite: Database): number => {
  const row = sqlite
    .query<{ total: number }, []>("SELECT count(*) AS total FROM sqlite_master")
    .get();
  return row?.total ?? 0;
};

const readAppliedNames = (sqlite: Database): Set<string> => {
  const rows = sqlite
    .query<{ name: string }, []>("SELECT name FROM schema_migrations")
    .all();
  return new Set(rows.map((row) => row.name));
};

const findLatestSnapshot = (backupsDir: string): string | null => {
  if (!existsSync(backupsDir)) {
    return null;
  }
  const candidates = readdirSync(backupsDir)
    .filter((file) => file.endsWith(".db"))
    .map((file) => join(backupsDir, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? null;
};

const buildNewerSchemaError = (
  unknownNames: readonly string[],
  backupsDir: string,
): Error => {
  const named = unknownNames.map((name) => `"${name}"`).join(", ");
  const latestSnapshot = findLatestSnapshot(backupsDir);
  const recovery =
    latestSnapshot === null
      ? `No backup snapshots were found in ${backupsDir}.`
      : `To go back, restore the most recent backup: ${latestSnapshot}`;
  return new Error(
    "This database was written by a newer version of Halero: " +
      `it already contains ${named}, which this version does not know about. ` +
      "Nothing was changed. Please run the newer version again, " +
      `or restore a backup made before the upgrade. ${recovery}`,
  );
};

const applyMigration = (sqlite: Database, migration: Migration): void => {
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    sqlite.exec(migration.sql);
    sqlite.run(
      "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
      [migration.name, Date.now()],
    );
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Migration "${migration.name}" failed and was rolled back, ` +
        `so it left no changes behind. No later migrations were run. Details: ${details}`,
    );
  }
};

export const runMigrations = (
  sqlite: Database,
  options: RunMigrationsOptions,
): RunMigrationsResult => {
  const isFreshDatabase = countSchemaObjects(sqlite) === 0;
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );

  const appliedNames = readAppliedNames(sqlite);
  const knownNames = new Set(
    options.migrations.map((migration) => migration.name),
  );
  const unknownNames = [...appliedNames].filter(
    (name) => !knownNames.has(name),
  );
  if (unknownNames.length > 0) {
    throw buildNewerSchemaError(unknownNames, options.backupsDir);
  }

  const pending = [...options.migrations]
    .sort(byNumericPrefix)
    .filter((migration) => !appliedNames.has(migration.name));
  const firstPending = pending[0];
  if (firstPending === undefined) {
    return { applied: [], snapshotPath: null };
  }

  const snapshotPath = isFreshDatabase
    ? null
    : join(options.backupsDir, `pre-${firstPending.name}-${Date.now()}.db`);
  if (snapshotPath !== null) {
    createSnapshot(sqlite, snapshotPath);
  }

  for (const migration of pending) {
    applyMigration(sqlite, migration);
  }
  return { applied: pending.map((migration) => migration.name), snapshotPath };
};
