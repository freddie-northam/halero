import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrCreateKey } from "./keys";

const originalEnvKey = process.env.HALERO_KEY;

const makeDataDir = (): string => mkdtempSync(join(tmpdir(), "halero-core-"));

beforeEach(() => {
  delete process.env.HALERO_KEY;
});

afterEach(() => {
  if (originalEnvKey === undefined) {
    delete process.env.HALERO_KEY;
    return;
  }
  process.env.HALERO_KEY = originalEnvKey;
});

describe("loadOrCreateKey", () => {
  test("creates a 32-byte key file with mode 0600, creating dataDir", () => {
    const dataDir = join(makeDataDir(), "nested", "data");

    const key = loadOrCreateKey(dataDir);

    expect(key).toHaveLength(32);
    const keyPath = join(dataDir, "key");
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
    expect(readFileSync(keyPath, "utf8")).toMatch(/^[0-9a-f]{64}$/);
  });

  test("returns the same key across calls", () => {
    const dataDir = makeDataDir();

    const first = loadOrCreateKey(dataDir);
    const second = loadOrCreateKey(dataDir);

    expect(second).toEqual(first);
  });

  test("HALERO_KEY env var wins over the key file", () => {
    const dataDir = makeDataDir();
    const fileKey = loadOrCreateKey(dataDir);
    process.env.HALERO_KEY = "ab".repeat(32);

    const key = loadOrCreateKey(dataDir);

    expect(key).toEqual(Uint8Array.from(Buffer.from("ab".repeat(32), "hex")));
    expect(key).not.toEqual(fileKey);
  });

  test("invalid HALERO_KEY throws a readable error", () => {
    process.env.HALERO_KEY = "not-hex";

    expect(() => loadOrCreateKey(makeDataDir())).toThrow(
      /HALERO_KEY.*64 hexadecimal characters/,
    );
  });

  test("a corrupt key file throws instead of being regenerated", () => {
    const dataDir = makeDataDir();
    const keyPath = join(dataDir, "key");
    writeFileSync(keyPath, "deadbeef");

    expect(() => loadOrCreateKey(dataDir)).toThrow(/not a valid/);
    expect(readFileSync(keyPath, "utf8")).toBe("deadbeef");
  });

  test("an unreadable key file throws a readable error, not a raw EACCES", () => {
    if (process.getuid?.() === 0) {
      // Root ignores file modes, so the permission guard cannot trip.
      return;
    }
    const dataDir = makeDataDir();
    const key = loadOrCreateKey(dataDir);
    expect(key).toHaveLength(32);
    const keyPath = join(dataDir, "key");
    chmodSync(keyPath, 0o000);

    try {
      expect(() => loadOrCreateKey(dataDir)).toThrow(/could not be read/);
    } finally {
      chmodSync(keyPath, 0o600);
    }
  });

  test("a data dir path that is a file throws a readable error", () => {
    const parent = makeDataDir();
    const dataDir = join(parent, "data");
    writeFileSync(dataDir, "this is a file, not a directory");

    expect(() => loadOrCreateKey(dataDir)).toThrow(/data directory/);
  });
});
