import type { HaleroDatabase } from "@halero/db";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Handler } from "hono";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  type LoginRateLimiter,
} from "../auth";
import type { HaleroConfig } from "../config";
import type { AppEnv } from "../middleware/session";
import type { TrpcContext } from "./context";
import { appRouter } from "./router";

export interface TrpcHandlerOptions {
  readonly config: HaleroConfig;
  readonly database: HaleroDatabase;
  readonly now: () => number;
  readonly loginRateLimiter: LoginRateLimiter;
}

const withCookies = (
  response: Response,
  cookies: readonly string[],
): Response => {
  if (cookies.length === 0) {
    return response;
  }
  const headers = new Headers(response.headers);
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }
  return new Response(response.body, { status: response.status, headers });
};

export const createTrpcHandler = (
  options: TrpcHandlerOptions,
): Handler<AppEnv> => {
  const { config, database, now, loginRateLimiter } = options;
  const secure = config.baseUrl.protocol === "https:";
  return async (c) => {
    const cookies: string[] = [];
    const context: TrpcContext = {
      db: database.db,
      sqlite: database.sqlite,
      config,
      session: c.get("session"),
      sessionToken: c.get("sessionToken"),
      now,
      loginRateLimiter,
      setSessionCookie: (token) =>
        cookies.push(buildSessionCookie(token, secure)),
      clearSessionCookie: () => cookies.push(buildClearSessionCookie(secure)),
    };
    const response = await fetchRequestHandler({
      endpoint: "/api/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext: () => context,
    });
    return withCookies(response, cookies);
  };
};
