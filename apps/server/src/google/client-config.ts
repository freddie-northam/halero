import { decryptCredentials, encryptCredentials } from "@halero/core";
import type { HaleroDatabase } from "@halero/db";
import { type HaleroConfig, isParseableUrl } from "../config";
import { getSetting, setSetting } from "../settings";

type Db = HaleroDatabase["db"];

// Self-hosters bring their own Google OAuth client; Halero ships no shared
// secrets. The client ID is public by design, the secret is encrypted with
// the boot key before it touches the settings table.
const CLIENT_ID_KEY = "google_oauth_client_id";
const CLIENT_SECRET_KEY = "google_oauth_client_secret_enc";

export interface GoogleClient {
  readonly clientId: string;
  readonly clientSecret: string;
}

export const saveGoogleClient = (
  db: Db,
  key: Uint8Array,
  client: GoogleClient,
): void => {
  setSetting(db, CLIENT_ID_KEY, client.clientId);
  const blob = encryptCredentials(key, client.clientSecret);
  setSetting(db, CLIENT_SECRET_KEY, Buffer.from(blob).toString("base64"));
};

export const readGoogleClient = (
  db: Db,
  key: Uint8Array,
): GoogleClient | null => {
  const clientId = getSetting(db, CLIENT_ID_KEY);
  const secretEnc = getSetting(db, CLIENT_SECRET_KEY);
  if (clientId === null || secretEnc === null) {
    return null;
  }
  const clientSecret = decryptCredentials(
    key,
    Uint8Array.from(Buffer.from(secretEnc, "base64")),
  );
  return { clientId, clientSecret };
};

export const isGoogleClientConfigured = (db: Db): boolean =>
  getSetting(db, CLIENT_ID_KEY) !== null &&
  getSetting(db, CLIENT_SECRET_KEY) !== null;

/**
 * The base URL people actually reach this instance at: the value stored
 * during setup wins over the environment-derived config default.
 */
export const resolveBaseUrl = (db: Db, config: HaleroConfig): URL => {
  const stored = getSetting(db, "base_url");
  if (stored !== null && isParseableUrl(stored)) {
    return new URL(stored);
  }
  return config.baseUrl;
};

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

/**
 * Google rejects OAuth redirect URIs on plain-http origins unless the host
 * is localhost, so a http non-localhost base URL can never finish the flow.
 */
export const isHttpsOk = (baseUrl: URL): boolean =>
  baseUrl.protocol === "https:" || LOCAL_HOSTNAMES.has(baseUrl.hostname);

export const googleRedirectUri = (baseUrl: URL): string =>
  new URL("/api/oauth/google/callback", baseUrl).toString();
