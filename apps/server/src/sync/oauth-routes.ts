// Generic OAuth routes for connecting a connector's account. The flow is
// host-owned; everything provider-specific (endpoints, scopes, extra auth
// params, identity extraction) comes from the connector resolved by the
// :connectorId path segment. One mount serves every OAuth2 connector.

import {
  asRecord,
  type FetchLike,
  type IdTokenClaims,
  type OAuth2Auth,
  stringOrNull,
} from "@halero/connector-sdk";
import type { HaleroDatabase } from "@halero/db";
import { type Context, Hono } from "hono";
import { resolveBaseUrl } from "../base-url";
import type { HaleroConfig } from "../config";
import { getCatalogEntry } from "../connections/catalog";
import {
  isHttpsOk,
  type OauthClient,
  oauthRedirectUri,
  readOauthClient,
} from "../connections/oauth-client";
import type { AppEnv } from "../middleware/session";
import { upsertConnection } from "./connection";
import { consumeOauthState, createOauthState } from "./oauth-state";
import { type AnyConnector, connectorRegistry } from "./registry";

export interface OauthRoutesOptions {
  readonly config: HaleroConfig;
  readonly database: HaleroDatabase;
  readonly key: Uint8Array;
  readonly now: () => number;
  readonly outboundFetch: FetchLike;
}

const SIGN_IN_MESSAGE = "You need to sign in before connecting an integration.";
const UNKNOWN_CONNECTOR_MESSAGE =
  "That integration cannot be connected in this Halero build.";

const displayNameOf = (connectorId: string): string =>
  getCatalogEntry(connectorId)?.displayName ?? connectorId;

const clientMissingMessage = (displayName: string): string =>
  `Add your ${displayName} OAuth client ID and secret in Settings before connecting.`;
const httpsMessage = (displayName: string): string =>
  `${displayName} requires an HTTPS address for the OAuth redirect. Serve ` +
  "Halero over HTTPS (for example on your own domain or with Tailscale " +
  "Serve), or open it at http://localhost.";

const oauth2ConnectorOf = (
  connectorId: string,
): { connector: AnyConnector; auth: OAuth2Auth } | null => {
  const connector = connectorRegistry.get(connectorId);
  if (connector === undefined || connector.auth.kind !== "oauth2") {
    return null;
  }
  return { connector, auth: connector.auth };
};

interface OauthTokenGrant {
  readonly accessToken: string;
  readonly expiresInSec: number;
  readonly refreshToken: string | null;
  readonly idToken: string | null;
}

const exchangeCode = async (
  outboundFetch: FetchLike,
  tokenEndpoint: string,
  client: OauthClient,
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

// Callback failures land back on the Integrations page with a short error
// code (never token material) that the UI turns into readable guidance.
const errorRedirect = (
  c: Context<AppEnv>,
  connectorId: string,
  code: string,
): Response =>
  c.redirect(`/settings/integrations?error=${code}&connector=${connectorId}`);

const handleCallback = async (
  c: Context<AppEnv>,
  options: OauthRoutesOptions,
  connectorId: string,
): Promise<Response> => {
  const { database, key, now, config, outboundFetch } = options;
  const db = database.db;
  const resolved = oauth2ConnectorOf(connectorId);
  if (resolved === null) {
    return errorRedirect(c, connectorId, "unknown_connector");
  }
  const displayName = displayNameOf(connectorId);
  if (stringOrNull(c.req.query("error")) !== null) {
    return errorRedirect(c, connectorId, "provider_denied");
  }
  const code = stringOrNull(c.req.query("code"));
  const state = stringOrNull(c.req.query("state"));
  if (code === null || state === null) {
    return errorRedirect(c, connectorId, "missing_code");
  }
  if (!consumeOauthState(db, now(), state)) {
    return errorRedirect(c, connectorId, "state_invalid");
  }
  // An undecryptable stored client secret (the encryption key changed
  // mid-flow) lands on the page as a readable banner asking for the client
  // details again, never as a generic 500.
  const client = ((): OauthClient | null | "unreadable" => {
    try {
      return readOauthClient(db, key, connectorId, displayName);
    } catch {
      return "unreadable";
    }
  })();
  if (client === "unreadable") {
    return errorRedirect(c, connectorId, "client_unreadable");
  }
  if (client === null) {
    return errorRedirect(c, connectorId, "client_not_configured");
  }
  const redirectUri = oauthRedirectUri(resolveBaseUrl(db, config), connectorId);
  const grant = await exchangeCode(
    outboundFetch,
    resolved.auth.tokenEndpoint,
    client,
    code,
    redirectUri,
  );
  if (grant === null) {
    return errorRedirect(c, connectorId, "token_exchange_failed");
  }
  if (grant.refreshToken === null) {
    return errorRedirect(c, connectorId, "no_refresh_token");
  }
  const claims =
    grant.idToken === null ? null : decodeIdTokenClaims(grant.idToken);
  const identity = claims === null ? null : resolved.connector.identify(claims);
  if (identity === null) {
    return errorRedirect(c, connectorId, "identity_missing");
  }
  const nowMs = now();
  upsertConnection(
    db,
    key,
    nowMs,
    { connectorId, displayName },
    { email: identity.displayEmail ?? null, accountKey: identity.accountKey },
    {
      refreshToken: grant.refreshToken,
      accessToken: grant.accessToken,
      accessTokenExpiresAt: nowMs + grant.expiresInSec * 1000,
    },
  );
  return c.redirect("/settings/integrations?connected=1");
};

export const createOauthRoutes = (
  options: OauthRoutesOptions,
): Hono<AppEnv> => {
  const { config, database, key, now } = options;
  const routes = new Hono<AppEnv>();

  routes.get("/:connectorId/start", (c) => {
    if (c.get("session") === null) {
      return c.json({ error: SIGN_IN_MESSAGE }, 401);
    }
    const connectorId = c.req.param("connectorId");
    const resolved = oauth2ConnectorOf(connectorId);
    if (resolved === null) {
      return c.json({ error: UNKNOWN_CONNECTOR_MESSAGE }, 404);
    }
    const displayName = displayNameOf(connectorId);
    const db = database.db;
    const baseUrl = resolveBaseUrl(db, config);
    if (!isHttpsOk(baseUrl)) {
      return c.json({ error: httpsMessage(displayName) }, 409);
    }
    const client = readOauthClient(db, key, connectorId, displayName);
    if (client === null) {
      return c.json({ error: clientMissingMessage(displayName) }, 409);
    }
    const authUrl = new URL(resolved.auth.authorizationEndpoint);
    authUrl.searchParams.set("client_id", client.clientId);
    authUrl.searchParams.set(
      "redirect_uri",
      oauthRedirectUri(baseUrl, connectorId),
    );
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", resolved.auth.scopes.join(" "));
    // Provider quirks (e.g. Google's access_type=offline and prompt=consent,
    // both required for a refresh token on reconnect) are declared by the
    // connector, not hardcoded here.
    for (const [name, value] of Object.entries(
      resolved.auth.extraAuthParams ?? {},
    )) {
      authUrl.searchParams.set(name, value);
    }
    authUrl.searchParams.set("state", createOauthState(db, now()));
    return c.redirect(authUrl.toString());
  });

  routes.get("/:connectorId/callback", (c) => {
    if (c.get("session") === null) {
      return c.json({ error: SIGN_IN_MESSAGE }, 401);
    }
    return handleCallback(c, options, c.req.param("connectorId"));
  });

  return routes;
};
