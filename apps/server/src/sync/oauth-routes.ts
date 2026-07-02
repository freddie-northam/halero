// OAuth routes for connecting a connector's account. The flow itself is
// host-owned; everything provider-specific (endpoints, scopes, extra
// auth params, identity extraction) comes from the connector's
// declarative OAuth2Spec and identify().

import {
  asRecord,
  type FetchLike,
  type IdTokenClaims,
  stringOrNull,
} from "@halero/connector-sdk";
import type { HaleroDatabase } from "@halero/db";
import { type Context, Hono } from "hono";
import { resolveBaseUrl } from "../base-url";
import type { HaleroConfig } from "../config";
import type { AppEnv } from "../middleware/session";
import {
  type GoogleClient,
  googleRedirectUri,
  isHttpsOk,
  readGoogleClient,
} from "./client-config";
import { upsertConnection } from "./connection";
import { consumeOauthState, createOauthState } from "./oauth-state";
import type { AnyConnector } from "./registry";

export interface GoogleOauthOptions {
  readonly config: HaleroConfig;
  readonly database: HaleroDatabase;
  readonly key: Uint8Array;
  readonly now: () => number;
  readonly outboundFetch: FetchLike;
  readonly connector: AnyConnector;
}

const SIGN_IN_MESSAGE =
  "You need to sign in before connecting Google Calendar.";
const CLIENT_MISSING_MESSAGE =
  "Add your Google OAuth client ID and secret in Settings before connecting.";
const HTTPS_MESSAGE =
  "Google requires an HTTPS address for the OAuth redirect. Serve Halero " +
  "over HTTPS (for example on your own domain or with Tailscale Serve), " +
  "or open it at http://localhost.";

interface OauthTokenGrant {
  readonly accessToken: string;
  readonly expiresInSec: number;
  readonly refreshToken: string | null;
  readonly idToken: string | null;
}

const exchangeCode = async (
  outboundFetch: FetchLike,
  tokenEndpoint: string,
  client: GoogleClient,
  code: string,
  redirectUri: string,
): Promise<OauthTokenGrant | null> => {
  const body = new URLSearchParams({
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await outboundFetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  }).catch(() => null);
  if (res === null || !res.ok) {
    return null;
  }
  const record = asRecord(await res.json().catch(() => null));
  if (record === null) {
    return null;
  }
  const accessToken = stringOrNull(record.access_token);
  const expiresInSec =
    typeof record.expires_in === "number" ? record.expires_in : null;
  if (accessToken === null || expiresInSec === null) {
    return null;
  }
  return {
    accessToken,
    expiresInSec,
    refreshToken: stringOrNull(record.refresh_token),
    idToken: stringOrNull(record.id_token),
  };
};

// Signature verification is NOT required because the token arrives directly
// from the provider's token endpoint over TLS; decoding the payload is
// enough. The connector's identify() picks the identity out of the claims.
export const decodeIdTokenClaims = (idToken: string): IdTokenClaims | null => {
  const segments = idToken.split(".");
  const payloadSegment = segments[1];
  if (segments.length !== 3 || payloadSegment === undefined) {
    return null;
  }
  try {
    return asRecord(
      JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8")),
    );
  } catch {
    return null;
  }
};

// Callback failures land back on the settings page with a short error code
// (never token material) that the UI turns into readable guidance.
const errorRedirect = (c: Context<AppEnv>, code: string): Response =>
  c.redirect(`/settings?error=${code}`);

const handleCallback = async (
  c: Context<AppEnv>,
  options: GoogleOauthOptions,
): Promise<Response> => {
  const { database, key, now, config, outboundFetch, connector } = options;
  const db = database.db;
  if (stringOrNull(c.req.query("error")) !== null) {
    return errorRedirect(c, "google_denied");
  }
  const code = stringOrNull(c.req.query("code"));
  const state = stringOrNull(c.req.query("state"));
  if (code === null || state === null) {
    return errorRedirect(c, "missing_code");
  }
  if (!consumeOauthState(db, now(), state)) {
    return errorRedirect(c, "state_invalid");
  }
  const client = readGoogleClient(db, key);
  if (client === null) {
    return errorRedirect(c, "client_not_configured");
  }
  const redirectUri = googleRedirectUri(resolveBaseUrl(db, config));
  const grant = await exchangeCode(
    outboundFetch,
    connector.auth.tokenEndpoint,
    client,
    code,
    redirectUri,
  );
  if (grant === null) {
    return errorRedirect(c, "token_exchange_failed");
  }
  if (grant.refreshToken === null) {
    return errorRedirect(c, "no_refresh_token");
  }
  const claims =
    grant.idToken === null ? null : decodeIdTokenClaims(grant.idToken);
  const identity = claims === null ? null : connector.identify(claims);
  if (identity === null) {
    return errorRedirect(c, "identity_missing");
  }
  const nowMs = now();
  upsertConnection(
    db,
    key,
    nowMs,
    { connectorId: connector.manifest.id, displayName: "Google Calendar" },
    { email: identity.displayEmail ?? null, accountKey: identity.accountKey },
    {
      refreshToken: grant.refreshToken,
      accessToken: grant.accessToken,
      accessTokenExpiresAt: nowMs + grant.expiresInSec * 1000,
    },
  );
  return c.redirect("/settings?connected=1");
};

export const createGoogleOauthRoutes = (
  options: GoogleOauthOptions,
): Hono<AppEnv> => {
  const { config, database, key, now, connector } = options;
  const routes = new Hono<AppEnv>();

  routes.get("/start", (c) => {
    if (c.get("session") === null) {
      return c.json({ error: SIGN_IN_MESSAGE }, 401);
    }
    const db = database.db;
    const baseUrl = resolveBaseUrl(db, config);
    if (!isHttpsOk(baseUrl)) {
      return c.json({ error: HTTPS_MESSAGE }, 409);
    }
    const client = readGoogleClient(db, key);
    if (client === null) {
      return c.json({ error: CLIENT_MISSING_MESSAGE }, 409);
    }
    const authUrl = new URL(connector.auth.authorizationEndpoint);
    authUrl.searchParams.set("client_id", client.clientId);
    authUrl.searchParams.set("redirect_uri", googleRedirectUri(baseUrl));
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", connector.auth.scopes.join(" "));
    // Provider quirks (e.g. Google's access_type=offline and
    // prompt=consent, both required for a refresh token on reconnect)
    // are declared by the connector, not hardcoded here.
    for (const [name, value] of Object.entries(
      connector.auth.extraAuthParams ?? {},
    )) {
      authUrl.searchParams.set(name, value);
    }
    authUrl.searchParams.set("state", createOauthState(db, now()));
    return c.redirect(authUrl.toString());
  });

  routes.get("/callback", (c) => {
    if (c.get("session") === null) {
      return c.json({ error: SIGN_IN_MESSAGE }, 401);
    }
    return handleCallback(c, options);
  });

  return routes;
};
