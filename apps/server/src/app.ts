import type { HaleroDatabase } from "@halero/db";
import { Hono } from "hono";
import { createLoginRateLimiter } from "./auth";
import { resolveBaseUrl } from "./base-url";
import type { HaleroConfig } from "./config";
import type { FetchLike } from "./google/common";
import { createGoogleOauthRoutes } from "./google/oauth-routes";
import { csrfOriginCheck } from "./middleware/csrf";
import { securityHeaders } from "./middleware/security-headers";
import { type AppEnv, sessionMiddleware } from "./middleware/session";
import { createSpaHandler, defaultWebDistDir } from "./spa";
import { createSyncRunner, type SyncRunner } from "./sync/runner";
import { createTrpcHandler } from "./trpc/handler";

export interface CreateAppOptions {
  readonly config: HaleroConfig;
  readonly database: HaleroDatabase;
  readonly key: Uint8Array;
  readonly webDistDir?: string;
  readonly now?: () => number;
  /** Fetch used for calls to Google; tests inject a fake. */
  readonly googleFetch?: FetchLike;
  /**
   * Shared sync run path. main.ts passes the instance its scheduler
   * drives so manual and scheduled syncs share one in-flight guard.
   */
  readonly syncRunner?: SyncRunner;
}

export const createApp = (options: CreateAppOptions): Hono<AppEnv> => {
  const { config, database, key } = options;
  const now = options.now ?? (() => Date.now());
  const googleFetch = options.googleFetch ?? fetch;
  const syncRunner =
    options.syncRunner ??
    createSyncRunner({ database, key, now, googleFetch, random: Math.random });
  const loginRateLimiter = createLoginRateLimiter();
  const app = new Hono<AppEnv>();

  app.use("*", securityHeaders);
  app.use(
    "/api/*",
    csrfOriginCheck(() => resolveBaseUrl(database.db, config).origin),
  );
  app.use("/api/*", sessionMiddleware(database.db, now));

  app.get("/healthz", (c) => c.json({ status: "ok" }));
  app.all(
    "/api/trpc/*",
    createTrpcHandler({
      config,
      database,
      key,
      now,
      loginRateLimiter,
      googleFetch,
      syncRunner,
    }),
  );
  app.route(
    "/api/oauth/google",
    createGoogleOauthRoutes({ config, database, key, now, googleFetch }),
  );
  app.get("*", createSpaHandler(options.webDistDir ?? defaultWebDistDir()));

  return app;
};
