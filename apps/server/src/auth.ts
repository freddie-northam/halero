import { createHash, randomBytes } from "node:crypto";
import { type HaleroDatabase, sessions } from "@halero/db";
import { eq, lte } from "drizzle-orm";

type Db = HaleroDatabase["db"];

export const SESSION_COOKIE_NAME = "halero_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const RATE_LIMIT_MESSAGE =
  "Too many login attempts. Please wait a minute and try again.";

export interface SessionRecord {
  readonly tokenHash: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

/** One hash for every credential lookup: sessions and API tokens. */
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const createSession = (db: Db, now: number): string => {
  const token = randomBytes(32).toString("hex");
  db.insert(sessions)
    .values({
      tokenHash: hashToken(token),
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    })
    .run();
  return token;
};

export const validateSession = (
  db: Db,
  token: string,
  now: number,
): SessionRecord | null => {
  db.delete(sessions).where(lte(sessions.expiresAt, now)).run();
  const row = db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .get();
  return row ?? null;
};

export const destroySession = (db: Db, token: string): void => {
  db.delete(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .run();
};

export const hashPassword = (password: string): Promise<string> =>
  Bun.password.hash(password, { algorithm: "argon2id" });

export const verifyPassword = (
  password: string,
  hash: string,
): Promise<boolean> => Bun.password.verify(password, hash);

export interface LoginRateLimiter {
  readonly isBlocked: (now: number) => boolean;
  readonly recordFailure: (now: number) => void;
}

export const createLoginRateLimiter = (
  maxFailures = 5,
  windowMs = 60_000,
): LoginRateLimiter => {
  const failures: number[] = [];
  const prune = (now: number): void => {
    const cutoff = now - windowMs;
    const kept = failures.filter((at) => at > cutoff);
    failures.length = 0;
    failures.push(...kept);
  };
  return {
    isBlocked: (now) => {
      prune(now);
      return failures.length >= maxFailures;
    },
    recordFailure: (now) => {
      prune(now);
      failures.push(now);
    },
  };
};

export const buildSessionCookie = (token: string, secure: boolean): string => {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const base = `${SESSION_COOKIE_NAME}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax`;
  return secure ? `${base}; Secure` : base;
};

export const buildClearSessionCookie = (secure: boolean): string => {
  const base = `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
  return secure ? `${base}; Secure` : base;
};
