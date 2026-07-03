// Personal API tokens for non-browser clients (Raycast, MCP). The
// plaintext token exists exactly once, in the mint response; storage
// and every lookup use the SHA-256 of the whole token string.

import { randomBytes } from "node:crypto";
import { ulid } from "@halero/core";
import { apiTokens, type HaleroDatabase } from "@halero/db";
import { and, eq, isNull } from "drizzle-orm";
import { hashToken } from "./auth";

type Db = HaleroDatabase["db"];

export const API_TOKEN_PREFIX = "halero_";

/**
 * last_used_at is display metadata, not security state, so it is
 * written at most once a minute to spare SD-card write churn.
 */
const LAST_USED_THROTTLE_MS = 60_000;

/** Mints a new plaintext token value; the caller decides who sees it. */
export const mintApiTokenValue = (): string =>
  `${API_TOKEN_PREFIX}${randomBytes(32).toString("hex")}`;

/** Stores a minted token (hash only) and returns the new token's id. */
export const createApiToken = (
  db: Db,
  name: string,
  tokenValue: string,
  now: number,
): string => {
  const id = ulid(now);
  db.insert(apiTokens)
    .values({ id, name, tokenHash: hashToken(tokenValue), createdAt: now })
    .run();
  return id;
};

export interface ApiTokenIdentity {
  readonly tokenId: string;
  readonly name: string;
}

/**
 * Resolves a presented token value to its identity, or null when the
 * token is unknown or revoked. Every miss looks the same to the caller;
 * nothing here throws on malformed input.
 */
export const validateApiToken = (
  db: Db,
  tokenValue: string,
  now: number,
): ApiTokenIdentity | null => {
  const row = db
    .select()
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.tokenHash, hashToken(tokenValue)),
        isNull(apiTokens.revokedAt),
      ),
    )
    .get();
  if (row === undefined) {
    return null;
  }
  if (row.lastUsedAt === null || now - row.lastUsedAt > LAST_USED_THROTTLE_MS) {
    db.update(apiTokens)
      .set({ lastUsedAt: now })
      .where(eq(apiTokens.id, row.id))
      .run();
  }
  return { tokenId: row.id, name: row.name };
};
