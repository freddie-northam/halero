import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  coreMigrations,
  type HaleroDatabase,
  openDatabase,
  runMigrations,
} from "@halero/db";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  createLoginRateLimiter,
  createSession,
  destroySession,
  hashPassword,
  SESSION_TTL_MS,
  validateSession,
  verifyPassword,
} from "./auth";

const openMigrated = (): HaleroDatabase => {
  const dir = mkdtempSync(join(tmpdir(), "halero-server-auth-"));
  const handle = openDatabase(join(dir, "halero.db"));
  runMigrations(handle.sqlite, {
    migrations: coreMigrations,
    backupsDir: join(dir, "backups"),
  });
  return handle;
};

describe("sessions", () => {
  test("createSession returns a raw token and stores only its hash", () => {
    const { db, sqlite } = openMigrated();

    const token = createSession(db, 1_000);

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const row = sqlite
      .query<{ token_hash: string; expires_at: number }, []>(
        "SELECT token_hash, expires_at FROM sessions",
      )
      .get();
    expect(row).not.toBeNull();
    expect(row?.token_hash).not.toBe(token);
    expect(row?.token_hash).not.toContain(token);
    expect(row?.expires_at).toBe(1_000 + SESSION_TTL_MS);
  });

  test("validateSession returns the session for a valid token", () => {
    const { db } = openMigrated();
    const token = createSession(db, 1_000);

    const session = validateSession(db, token, 2_000);

    expect(session).not.toBeNull();
    expect(session?.expiresAt).toBe(1_000 + SESSION_TTL_MS);
  });

  test("validateSession returns null for unknown tokens", () => {
    const { db } = openMigrated();

    expect(validateSession(db, "f".repeat(64), 1_000)).toBeNull();
  });

  test("validateSession returns null after expiry and prunes the row", () => {
    const { db, sqlite } = openMigrated();
    const token = createSession(db, 1_000);

    const session = validateSession(db, token, 1_000 + SESSION_TTL_MS + 1);

    expect(session).toBeNull();
    const count = sqlite
      .query<{ total: number }, []>("SELECT count(*) AS total FROM sessions")
      .get();
    expect(count?.total).toBe(0);
  });

  test("destroySession removes the session", () => {
    const { db } = openMigrated();
    const token = createSession(db, 1_000);

    destroySession(db, token);

    expect(validateSession(db, token, 2_000)).toBeNull();
  });
});

describe("passwords", () => {
  test("hashPassword produces an argon2id hash that verifies", async () => {
    const hash = await hashPassword("correct horse battery");

    expect(hash).toStartWith("$argon2id$");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });
});

describe("login rate limiter", () => {
  test("allows attempts until five failures in the window", () => {
    const limiter = createLoginRateLimiter();

    for (const _ of [1, 2, 3, 4, 5]) {
      expect(limiter.isBlocked(1_000)).toBe(false);
      limiter.recordFailure(1_000);
    }

    expect(limiter.isBlocked(1_000)).toBe(true);
  });

  test("unblocks once failures fall outside the one-minute window", () => {
    const limiter = createLoginRateLimiter();
    for (const _ of [1, 2, 3, 4, 5]) {
      limiter.recordFailure(1_000);
    }

    expect(limiter.isBlocked(1_000)).toBe(true);
    expect(limiter.isBlocked(1_000 + 60_001)).toBe(false);
  });
});

describe("session cookies", () => {
  test("session cookie is httpOnly, SameSite=Lax, Path=/ and not Secure on http", () => {
    const cookie = buildSessionCookie("abc123", false);

    expect(cookie).toStartWith("halero_session=abc123;");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`);
    expect(cookie).not.toContain("Secure");
  });

  test("session cookie is Secure on https", () => {
    expect(buildSessionCookie("abc123", true)).toContain("Secure");
  });

  test("clear cookie expires immediately", () => {
    const cookie = buildClearSessionCookie(false);

    expect(cookie).toStartWith("halero_session=;");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
  });
});
