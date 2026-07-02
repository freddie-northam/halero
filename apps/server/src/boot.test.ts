import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { boot } from "./boot";
import { loadConfig } from "./config";

const makeConfig = () => {
  const dir = mkdtempSync(join(tmpdir(), "halero-server-boot-"));
  const dataDir = join(dir, "data");
  return loadConfig({ HALERO_DATA_DIR: dataDir });
};

describe("boot", () => {
  test("creates the data dir, key file, and migrated database", () => {
    const config = makeConfig();

    const result = boot(config);

    expect(existsSync(config.dataDir)).toBe(true);
    expect(existsSync(join(config.dataDir, "key"))).toBe(true);
    expect(existsSync(join(config.dataDir, "halero.db"))).toBe(true);
    expect(result.key.length).toBe(32);
    const table = result.database.sqlite
      .query("SELECT name FROM sqlite_master WHERE name = 'sessions'")
      .get();
    expect(table).not.toBeNull();
  });

  test("boots twice against the same data dir without error", () => {
    const config = makeConfig();

    const first = boot(config);
    first.database.sqlite.close();
    const second = boot(config);

    expect(second.config).toEqual(config);
    const table = second.database.sqlite
      .query("SELECT name FROM sqlite_master WHERE name = 'settings'")
      .get();
    expect(table).not.toBeNull();
  });
});
