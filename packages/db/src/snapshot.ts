import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Writes a compacted copy of the live database to targetPath using
// VACUUM INTO. Shared by the migration runner and scheduled backups.
export const createSnapshot = (sqlite: Database, targetPath: string): void => {
  if (existsSync(targetPath)) {
    throw new Error(
      `A snapshot already exists at ${targetPath}. ` +
        "Refusing to overwrite it: move the existing file or pick another name.",
    );
  }
  mkdirSync(dirname(targetPath), { recursive: true });
  sqlite.run("VACUUM INTO ?", [targetPath]);
};
