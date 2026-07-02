import { decryptCredentials, encryptCredentials } from "@halero/core";
import { connections, type HaleroDatabase } from "@halero/db";
import { eq } from "drizzle-orm";
import { readGoogleClient } from "./client-config";
import {
  asRecord,
  type FetchLike,
  GOOGLE_TOKEN_URL,
  stringOrNull,
} from "./common";
import type { ConnectionRow, GoogleTokens } from "./connection";

export type { ConnectionRow } from "./connection";

type Db = HaleroDatabase["db"];

export interface GoogleTokenContext {
  readonly db: Db;
  readonly key: Uint8Array;
  readonly now: () => number;
  readonly googleFetch: FetchLike;
}

const EXPIRY_MARGIN_MS = 60_000;

const REAUTH_MESSAGE =
  "Google no longer accepts the saved sign-in for this connection. " +
  "Open Settings and reconnect Google Calendar.";
const TRANSIENT_MESSAGE =
  "Google's token service did not respond as expected. This is usually " +
  "temporary; the next attempt will try again.";
const MISSING_CREDENTIALS_MESSAGE =
  "This connection has no saved Google credentials. Reconnect Google " +
  "Calendar from Settings.";
const CLIENT_MISSING_MESSAGE =
  "The Google OAuth client is not configured. Add the client ID and " +
  "secret in Settings.";

const parseStoredTokens = (raw: string): GoogleTokens | null => {
  try {
    const record = asRecord(JSON.parse(raw));
    if (record === null) {
      return null;
    }
    const refreshToken = stringOrNull(record.refreshToken);
    const accessToken = stringOrNull(record.accessToken);
    const { accessTokenExpiresAt } = record;
    if (
      refreshToken === null ||
      accessToken === null ||
      typeof accessTokenExpiresAt !== "number"
    ) {
      return null;
    }
    return { refreshToken, accessToken, accessTokenExpiresAt };
  } catch {
    return null;
  }
};

const requestRefresh = async (
  ctx: GoogleTokenContext,
  refreshToken: string,
): Promise<Response | null> => {
  const client = readGoogleClient(ctx.db, ctx.key);
  if (client === null) {
    throw new Error(CLIENT_MISSING_MESSAGE);
  }
  const body = new URLSearchParams({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  return ctx
    .googleFetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
    .catch(() => null);
};

const refreshAccessToken = async (
  ctx: GoogleTokenContext,
  connection: ConnectionRow,
  stored: GoogleTokens,
): Promise<string> => {
  const res = await requestRefresh(ctx, stored.refreshToken);
  if (res === null) {
    throw new Error(TRANSIENT_MESSAGE);
  }
  const record = asRecord(await res.json().catch(() => null));
  if (!res.ok) {
    // Google reports a revoked or expired refresh token as invalid_grant.
    // Only a fresh consent flow can fix that, so surface it as a state.
    if (record !== null && stringOrNull(record.error) === "invalid_grant") {
      ctx.db
        .update(connections)
        .set({ status: "reauth_required" })
        .where(eq(connections.id, connection.id))
        .run();
      throw new Error(REAUTH_MESSAGE);
    }
    throw new Error(TRANSIENT_MESSAGE);
  }
  const accessToken =
    record === null ? null : stringOrNull(record.access_token);
  const expiresInSec =
    record !== null && typeof record.expires_in === "number"
      ? record.expires_in
      : null;
  if (accessToken === null || expiresInSec === null) {
    throw new Error(TRANSIENT_MESSAGE);
  }
  const updated: GoogleTokens = {
    // Google may rotate the refresh token; keep the old one otherwise.
    refreshToken:
      (record === null ? null : stringOrNull(record.refresh_token)) ??
      stored.refreshToken,
    accessToken,
    accessTokenExpiresAt: ctx.now() + expiresInSec * 1000,
  };
  ctx.db
    .update(connections)
    .set({
      credentialsEnc: Buffer.from(
        encryptCredentials(ctx.key, JSON.stringify(updated)),
      ),
    })
    .where(eq(connections.id, connection.id))
    .run();
  return accessToken;
};

/**
 * Returns a usable access token for the connection, refreshing (and
 * re-encrypting the stored credentials) when the cached one is within
 * 60 seconds of expiry.
 */
export const getGoogleAccessToken = async (
  ctx: GoogleTokenContext,
  connection: ConnectionRow,
): Promise<string> => {
  if (connection.credentialsEnc === null) {
    throw new Error(MISSING_CREDENTIALS_MESSAGE);
  }
  const stored = parseStoredTokens(
    decryptCredentials(ctx.key, connection.credentialsEnc),
  );
  if (stored === null) {
    throw new Error(MISSING_CREDENTIALS_MESSAGE);
  }
  if (stored.accessTokenExpiresAt - ctx.now() > EXPIRY_MARGIN_MS) {
    return stored.accessToken;
  }
  return refreshAccessToken(ctx, connection, stored);
};
