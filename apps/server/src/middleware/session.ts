import type { HaleroDatabase } from "@halero/db";
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import {
  SESSION_COOKIE_NAME,
  type SessionRecord,
  validateSession,
} from "../auth";

export interface SessionVariables {
  session: SessionRecord | null;
  sessionToken: string | null;
}

export interface AppEnv {
  Variables: SessionVariables;
}

export const sessionMiddleware =
  (db: HaleroDatabase["db"], now: () => number): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    const session =
      token === undefined ? null : validateSession(db, token, now());
    c.set("session", session);
    c.set("sessionToken", session === null ? null : (token ?? null));
    return next();
  };
