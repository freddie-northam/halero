import type { HaleroDatabase } from "@halero/db";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { validateApiToken } from "../api-tokens";
import { SESSION_COOKIE_NAME, validateSession } from "../auth";

type Db = HaleroDatabase["db"];

/**
 * Who is making this request. Password principals come from the
 * browser's session cookie; apiToken principals from an
 * Authorization: Bearer header (Raycast, MCP, scripts).
 */
export type Principal =
  | { readonly kind: "password"; readonly token: string }
  | {
      readonly kind: "apiToken";
      readonly tokenId: string;
      readonly name: string;
    };

export interface SessionVariables {
  session: Principal | null;
}

export interface AppEnv {
  Variables: SessionVariables;
}

const BEARER_PREFIX = "Bearer ";

/**
 * Decides the principal for a request carrying an Authorization
 * header. The header alone decides: a malformed value or an unknown or
 * revoked token means unauthenticated, never an error and never a
 * fallback to the session cookie.
 */
const bearerPrincipal = (
  db: Db,
  header: string,
  now: number,
): Principal | null => {
  if (!header.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const tokenValue = header.slice(BEARER_PREFIX.length).trim();
  if (tokenValue === "") {
    return null;
  }
  const identity = validateApiToken(db, tokenValue, now);
  if (identity === null) {
    return null;
  }
  return { kind: "apiToken", tokenId: identity.tokenId, name: identity.name };
};

const cookiePrincipal = (
  db: Db,
  c: Context<AppEnv>,
  now: number,
): Principal | null => {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (token === undefined) {
    return null;
  }
  if (validateSession(db, token, now) === null) {
    return null;
  }
  return { kind: "password", token };
};

export const sessionMiddleware =
  (db: Db, now: () => number): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const authorization = c.req.header("authorization");
    // Bearer wins and NEVER falls back: when any Authorization header
    // is present the cookie is not consulted at all. This is what makes
    // the CSRF exemption for bearer requests sound; if the cookie could
    // decide such a request, a cross-site page could ride it past the
    // skipped origin check.
    const session =
      authorization === undefined
        ? cookiePrincipal(db, c, now())
        : bearerPrincipal(db, authorization, now());
    c.set("session", session);
    return next();
  };
