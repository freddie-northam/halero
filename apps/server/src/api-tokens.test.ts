import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  apiTokens,
  coreMigrations,
  type HaleroDatabase,
  openDatabase,
  runMigrations,
} from "@halero/db";
import { eq } from "drizzle-orm";
import {
  createApiToken,
  mintApiTokenValue,
  validateApiToken,
} from "./api-tokens";

const openMigrated = (): HaleroDatabase => {
  const dir = mkdtempSync(join(tmpdir(), "halero-server-api-tokens-"));
  const handle = openDatabase(join(dir, "halero.db"));
  runMigrations(handle.sqlite, {
    migrations: coreMigrations,
    backupsDir: join(dir, "backups"),
  });
  return handle;
};

const sha256Hex = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

describe("mintApiTokenValue", () => {
  test("mints halero_ plus 32 random bytes as hex", () => {
    const value = mintApiTokenValue();

    expect(value).toMatch(/^halero_[0-9a-f]{64}$/);
    expect(mintApiTokenValue()).not.toBe(value);
  });
});

describe("createApiToken", () => {
  test("stores only the SHA-256 of the whole token string, never plaintext", () => {
    const { db, sqlite } = openMigrated();
    const value = mintApiTokenValue();

    const tokenId = createApiToken(db, "Raycast", value, 1_000);

    const row = sqlite
      .query<
        { id: string; name: string; token_hash: string; created_at: number },
        []
      >("SELECT id, name, token_hash, created_at FROM api_tokens")
      .get();
    expect(row?.id).toBe(tokenId);
    expect(row?.name).toBe("Raycast");
    expect(row?.created_at).toBe(1_000);
    // The hash covers the WHOLE token string, prefix included, and the
    // stored value never contains the random part.
    expect(row?.token_hash).toBe(sha256Hex(value));
    expect(row?.token_hash).not.toContain(value.slice("halero_".length));
    sqlite.close();
  });
});

describe("validateApiToken", () => {
  test("returns tokenId and name for a live token", () => {
    const { db, sqlite } = openMigrated();
    const value = mintApiTokenValue();
    const tokenId = createApiToken(db, "Raycast", value, 1_000);

    expect(validateApiToken(db, value, 2_000)).toEqual({
      tokenId,
      name: "Raycast",
    });
    sqlite.close();
  });

  test("returns null for an unknown token", () => {
    const { db, sqlite } = openMigrated();
    createApiToken(db, "Raycast", mintApiTokenValue(), 1_000);

    expect(validateApiToken(db, mintApiTokenValue(), 2_000)).toBeNull();
    sqlite.close();
  });

  test("returns null for a revoked token", () => {
    const { db, sqlite } = openMigrated();
    const value = mintApiTokenValue();
    const tokenId = createApiToken(db, "Raycast", value, 1_000);
    db.update(apiTokens)
      .set({ revokedAt: 1_500 })
      .where(eq(apiTokens.id, tokenId))
      .run();

    expect(validateApiToken(db, value, 2_000)).toBeNull();
    sqlite.close();
  });

  test("last_used_at is set on first use and throttled to one write a minute", () => {
    const { db, sqlite } = openMigrated();
    const value = mintApiTokenValue();
    createApiToken(db, "Raycast", value, 1_000);
    const lastUsedAt = (): number | null =>
      sqlite
        .query<{ last_used_at: number | null }, []>(
          "SELECT last_used_at FROM api_tokens",
        )
        .get()?.last_used_at ?? null;
    expect(lastUsedAt()).toBeNull();

    // First use writes.
    expect(validateApiToken(db, value, 10_000)).not.toBeNull();
    expect(lastUsedAt()).toBe(10_000);
    // Within 60 seconds: authenticated, but no write.
    expect(validateApiToken(db, value, 10_000 + 59_000)).not.toBeNull();
    expect(lastUsedAt()).toBe(10_000);
    // Older than 60 seconds: the timestamp advances.
    expect(validateApiToken(db, value, 10_000 + 61_000)).not.toBeNull();
    expect(lastUsedAt()).toBe(10_000 + 61_000);
    sqlite.close();
  });
});
