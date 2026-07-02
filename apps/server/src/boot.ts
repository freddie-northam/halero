import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadOrCreateKey } from "@halero/core";
import {
  coreMigrations,
  type HaleroDatabase,
  openDatabase,
  runMigrations,
} from "@halero/db";
import type { HaleroConfig } from "./config";

export interface BootResult {
  readonly config: HaleroConfig;
  readonly database: HaleroDatabase;
  readonly key: Uint8Array;
}

export const boot = (config: HaleroConfig): BootResult => {
  mkdirSync(config.dataDir, { recursive: true });
  const key = loadOrCreateKey(config.dataDir);
  const database = openDatabase(join(config.dataDir, "halero.db"));
  runMigrations(database.sqlite, {
    migrations: coreMigrations,
    backupsDir: join(config.dataDir, "backups"),
  });
  return { config, database, key };
};
