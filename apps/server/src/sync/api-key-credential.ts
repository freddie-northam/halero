// Static-token (apiKey) credential storage. Where OAuth connections store
// { refreshToken, accessToken, accessTokenExpiresAt }, an apiKey connection
// stores just { token }: a personal access token the user pasted, with no
// refresh cycle. Kept opaque-per-connector like the OAuth blob, so the
// connections table needs no new columns.

import { asRecord, stringOrNull } from "@halero/connector-sdk";
import { decryptCredentials, encryptCredentials } from "@halero/core";
import type { ConnectionRow } from "./connection";

const MISSING_TOKEN_MESSAGE =
  "This connection has no saved access token. Reconnect it from " +
  "Settings and paste a fresh token.";
const UNREADABLE_TOKEN_MESSAGE =
  "The saved access token for this connection could not be read, usually " +
  "because the encryption key changed. Reconnect it from Settings.";

/** Encrypts a pasted token into the credentials_enc blob shape. */
export const encryptApiKeyCredential = (
  key: Uint8Array,
  token: string,
): Uint8Array => encryptCredentials(key, JSON.stringify({ token }));

/** Parses a decrypted `{ token }` blob, or null when it is not that shape. */
export const parseApiKeyCredential = (raw: string): string | null => {
  try {
    const record = asRecord(JSON.parse(raw));
    return record === null ? null : stringOrNull(record.token);
  } catch {
    return null;
  }
};

/**
 * Decrypts and returns the stored token for an apiKey connection. Throws
 * readable errors when the connection has no credentials or the blob is
 * undecryptable (a changed key), the same failure modes the OAuth path
 * surfaces.
 */
export const readApiKeyToken = (
  key: Uint8Array,
  connection: ConnectionRow,
): string => {
  if (connection.credentialsEnc === null) {
    throw new Error(MISSING_TOKEN_MESSAGE);
  }
  let decrypted: string;
  try {
    decrypted = decryptCredentials(key, connection.credentialsEnc);
  } catch (error) {
    throw new Error(UNREADABLE_TOKEN_MESSAGE, { cause: error });
  }
  const token = parseApiKeyCredential(decrypted);
  if (token === null) {
    throw new Error(MISSING_TOKEN_MESSAGE);
  }
  return token;
};
