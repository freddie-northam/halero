// Per-connector OAuth app credentials (the client ID + secret a self-hoster
// registers with the provider). Halero ships no shared secrets. Keys are
// namespaced by connector id (connection.<id>.oauthClientId /
// .oauthClientSecretEnc); the client ID is public by design, the secret is
// AES-GCM encrypted with the boot key. A legacy read-fallback keeps a Google
// connection configured before this file existed working unchanged.

import { decryptCredentials, encryptCredentials } from "@halero/core";
import type { HaleroDatabase } from "@halero/db";
import { getSetting, setSetting } from "../settings";

type Db = HaleroDatabase["db"];

export interface OauthClient {
  readonly clientId: string;
  readonly clientSecret: string;
}

const idKey = (connectorId: string): string =>
  `connection.${connectorId}.oauthClientId`;
const secretKey = (connectorId: string): string =>
  `connection.${connectorId}.oauthClientSecretEnc`;

// The two keys the Google client used before per-connector namespacing.
// Read-only: new saves always write the namespaced keys above.
const LEGACY_GOOGLE_ID_KEY = "google_oauth_client_id";
const LEGACY_GOOGLE_SECRET_KEY = "google_oauth_client_secret_enc";
const GOOGLE_CONNECTOR_ID = "google-calendar";

const legacyKeys = (
  connectorId: string,
): { idKey: string; secretKey: string } | null =>
  connectorId === GOOGLE_CONNECTOR_ID
    ? { idKey: LEGACY_GOOGLE_ID_KEY, secretKey: LEGACY_GOOGLE_SECRET_KEY }
    : null;

/** Reads the raw stored id + encrypted-secret pair, new keys then legacy. */
const readRaw = (
  db: Db,
  connectorId: string,
): { clientId: string; secretEnc: string } | null => {
  const clientId = getSetting(db, idKey(connectorId));
  const secretEnc = getSetting(db, secretKey(connectorId));
  if (clientId !== null && secretEnc !== null) {
    return { clientId, secretEnc };
  }
  const legacy = legacyKeys(connectorId);
  if (legacy === null) {
    return null;
  }
  const legacyId = getSetting(db, legacy.idKey);
  const legacySecret = getSetting(db, legacy.secretKey);
  if (legacyId === null || legacySecret === null) {
    return null;
  }
  return { clientId: legacyId, secretEnc: legacySecret };
};

export const saveOauthClient = (
  db: Db,
  key: Uint8Array,
  connectorId: string,
  client: OauthClient,
): void => {
  setSetting(db, idKey(connectorId), client.clientId);
  const blob = encryptCredentials(key, client.clientSecret);
  setSetting(db, secretKey(connectorId), Buffer.from(blob).toString("base64"));
};

const secretUnreadableMessage = (displayName: string): string =>
  `The saved ${displayName} client secret could not be read, usually ` +
  "because the encryption key changed. Enter the client ID and secret " +
  "again in Settings.";

export const readOauthClient = (
  db: Db,
  key: Uint8Array,
  connectorId: string,
  displayName: string,
): OauthClient | null => {
  const raw = readRaw(db, connectorId);
  if (raw === null) {
    return null;
  }
  try {
    const clientSecret = decryptCredentials(
      key,
      Uint8Array.from(Buffer.from(raw.secretEnc, "base64")),
    );
    return { clientId: raw.clientId, clientSecret };
  } catch (error) {
    throw new Error(secretUnreadableMessage(displayName), { cause: error });
  }
};

export const isOauthClientConfigured = (db: Db, connectorId: string): boolean =>
  readRaw(db, connectorId) !== null;

// URL.hostname keeps the brackets around IPv6 literals, so [::1] is matched
// exactly. Providers' plain-http loopback exception covers these three.
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Most OAuth providers reject redirect URIs on plain-http origins unless
 * the host is loopback, so an http non-localhost base URL can never finish
 * the flow.
 */
export const isHttpsOk = (baseUrl: URL): boolean =>
  baseUrl.protocol === "https:" || LOCAL_HOSTNAMES.has(baseUrl.hostname);

export const oauthRedirectUri = (baseUrl: URL, connectorId: string): string =>
  new URL(`/api/oauth/${connectorId}/callback`, baseUrl).toString();
