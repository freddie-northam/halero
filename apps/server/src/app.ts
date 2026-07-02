import type { HaleroDatabase } from "@halero/db";
import { Hono } from "hono";
import { createLoginRateLimiter } from "./auth";
import type { HaleroConfig } from "./config";
import { csrfOriginCheck } from "./middleware/csrf";
import { securityHeaders } from "./middleware/security-headers";
import { type AppEnv, sessionMiddleware } from "./middleware/session";
import { createSpaHandler, defaultWebDistDir } from "./spa";
import { createTrpcHandler } from "./trpc/handler";

export interface CreateAppOptions {
  readonly config: HaleroConfig;
  readonly database: HaleroDatabase;
  readonly webDistDir?: string;
  readonly now?: () => number;
}

export const createApp = (options: CreateAppOptions): Hono<AppEnv> => {
  const { config, database } = options;
  const now = options.now ?? (() => Date.now());
  const loginRateLimiter = createLoginRateLimiter();
  const app = new Hono<AppEnv>();

  app.use("*", securityHeaders);
  app.use("/api/*", csrfOriginCheck(config.baseUrl.origin));
  app.use("/api/*", sessionMiddleware(database.db, now));

  app.get("/healthz", (c) => c.json({ status: "ok" }));
  app.all(
    "/api/trpc/*",
    createTrpcHandler({ config, database, now, loginRateLimiter }),
  );
  app.get("*", createSpaHandler(options.webDistDir ?? defaultWebDistDir()));

  return app;
};
