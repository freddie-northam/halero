import { decryptCredentials, encryptCredentials } from "@halero/core";
import type { HaleroDatabase } from "@halero/db";
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

const CLIENT_SECRET_UNREADABLE_MESSAGE =
  "The saved Google client secret could not be read, usually because " +
  "the encryption key changed. Enter the client ID and secret again in " +
  "Settings.";

export const readGoogleClient = (
  db: Db,
  key: Uint8Array,
): GoogleClient | null => {
  const clientId = getSetting(db, CLIENT_ID_KEY);
  const secretEnc = getSetting(db, CLIENT_SECRET_KEY);
  if (clientId === null || secretEnc === null) {
    return null;
  }
  try {
    const clientSecret = decryptCredentials(
      key,
      Uint8Array.from(Buffer.from(secretEnc, "base64")),
    );
    return { clientId, clientSecret };
  } catch (error) {
    throw new Error(CLIENT_SECRET_UNREADABLE_MESSAGE, { cause: error });
  }
};

export const isGoogleClientConfigured = (db: Db): boolean =>
  getSetting(db, CLIENT_ID_KEY) !== null &&
  getSetting(db, CLIENT_SECRET_KEY) !== null;

// URL.hostname keeps the brackets around IPv6 literals, so [::1] is
// matched exactly as it appears in a base URL. Google's plain-http
// loopback exception covers all three of these.
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Google rejects OAuth redirect URIs on plain-http origins unless the host
 * is localhost, so a http non-localhost base URL can never finish the flow.
 */
export const isHttpsOk = (baseUrl: URL): boolean =>
  baseUrl.protocol === "https:" || LOCAL_HOSTNAMES.has(baseUrl.hostname);

export const googleRedirectUri = (baseUrl: URL): string =>
  new URL("/api/oauth/google/callback", baseUrl).toString();
