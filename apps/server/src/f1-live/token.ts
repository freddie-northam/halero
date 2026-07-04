// OpenF1 live-timing auth: the OAuth2 password grant. The user's account
// username + password are exchanged at the token endpoint for a bearer
// token valid one hour, then sent as `Authorization: Bearer` on live
// requests. The token is cached in-process (single-user host) and refreshed
// a minute before it expires.

import type { FetchLike } from "@halero/connector-sdk";
import type { LiveCredential } from "./credential";

export const OPENF1_TOKEN_ENDPOINT = "https://api.openf1.org/token";

const UNREACHABLE_MESSAGE =
  "Halero could not reach OpenF1 to sign in for live timing. Check the " +
  "server's internet connection and try again.";
const REJECTED_MESSAGE =
  "OpenF1 did not accept those live-timing credentials. Check the username " +
  "and password for your OpenF1 account and try again.";
const UNEXPECTED_MESSAGE =
  "OpenF1 returned an unexpected sign-in response. Try again later.";

export interface LiveToken {
  readonly token: string;
  readonly expiresAt: number;
}

/**
 * Exchanges the credential for a bearer token. Throws readable errors on
 * an unreachable endpoint, rejected credentials, or a malformed response.
 */
export const exchangeToken = async (
  fetchImpl: FetchLike,
  credential: LiveCredential,
  now: number,
): Promise<LiveToken> => {
  const body = new URLSearchParams({
    username: credential.username,
    password: credential.password,
  });
  const response = await fetchImpl(OPENF1_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  }).catch(() => null);
  if (response === null) {
    throw new Error(UNREACHABLE_MESSAGE);
  }
  if (!response.ok) {
    throw new Error(REJECTED_MESSAGE);
  }
  const json: unknown = await response.json().catch(() => null);
  const record =
    typeof json === "object" && json !== null
      ? (json as Record<string, unknown>)
      : null;
  const token =
    record !== null && typeof record.access_token === "string"
      ? record.access_token
      : null;
  const expiresInSec = record === null ? Number.NaN : Number(record.expires_in);
  if (token === null || !Number.isFinite(expiresInSec)) {
    throw new Error(UNEXPECTED_MESSAGE);
  }
  return { token, expiresAt: now + expiresInSec * 1000 };
};

const REFRESH_MARGIN_MS = 60_000;

let cached: { readonly username: string; readonly token: LiveToken } | null =
  null;

/**
 * Returns a valid bearer token, reusing the cached one until a minute
 * before it expires. Keyed by username so changing accounts re-exchanges.
 */
export const getLiveToken = async (
  fetchImpl: FetchLike,
  credential: LiveCredential,
  now: () => number,
): Promise<string> => {
  const current = now();
  if (
    cached !== null &&
    cached.username === credential.username &&
    cached.token.expiresAt - REFRESH_MARGIN_MS > current
  ) {
    return cached.token.token;
  }
  const token = await exchangeToken(fetchImpl, credential, current);
  cached = { username: credential.username, token };
  return token.token;
};

/** Test seam: drops the cached token. */
export const resetLiveTokenCache = (): void => {
  cached = null;
};
