import type { FetchLike } from "@halero/connector-sdk";
import type { HaleroDatabase } from "@halero/db";
import { Hono } from "hono";
import { createLoginRateLimiter } from "./auth";
import { resolveBaseUrl } from "./base-url";
import type { HaleroConfig } from "./config";
import { createExportRoutes } from "./export-routes";
import {
  buildHealthReport,
  createSchedulerHealth,
  type SchedulerHealth,
} from "./healthz";
import { csrfOriginCheck } from "./middleware/csrf";
import {
  createSecureErrorHandler,
  securityHeaders,
} from "./middleware/security-headers";
import { type AppEnv, sessionMiddleware } from "./middleware/session";
import { createNotifier, type Notifier } from "./notifier";
import { createSpaHandler, defaultWebDistDir } from "./spa";
import { createOauthRoutes } from "./sync/oauth-routes";
import { createSyncRunner, type SyncRunner } from "./sync/runner";
import { createTrpcHandler } from "./trpc/handler";

export interface CreateAppOptions {
  readonly config: HaleroConfig;
  readonly database: HaleroDatabase;
  readonly key: Uint8Array;
  readonly webDistDir?: string;
  readonly now?: () => number;
  /** Fetch used for outbound provider calls; tests inject a fake. */
  readonly outboundFetch?: FetchLike;
  /**
   * Shared sync run path. main.ts passes the instance its scheduler
   * drives so manual and scheduled syncs share one in-flight guard.
   */
  readonly syncRunner?: SyncRunner;
  /**
   * Notifier shared with the runner main.ts builds. Tests build one
   * from a fake fetch via makeTestApp's notifyFetch option.
   */
  readonly notifier?: Notifier;
  /** Parent directory for export snapshots; tests inject to observe. */
  readonly exportSnapshotDir?: string;
  /**
   * Scheduler liveness shared with the scheduler in main.ts. Defaults
   * to a fresh (never-started) state, so an app without a scheduler
   * reports lastTickAt: null and is never tick-stale.
   */
  readonly schedulerHealth?: SchedulerHealth;
}

export const createApp = (options: CreateAppOptions): Hono<AppEnv> => {
  const { config, database, key } = options;
  const now = options.now ?? (() => Date.now());
  const outboundFetch = options.outboundFetch ?? fetch;
  const notifier =
    options.notifier ?? createNotifier({ db: database.db, notifyFetch: fetch });
  const syncRunner =
    options.syncRunner ??
    createSyncRunner({
      database,
      key,
      now,
      outboundFetch,
      random: Math.random,
      notifier,
    });
  const loginRateLimiter = createLoginRateLimiter();
  const app = new Hono<AppEnv>();

  app.use("*", securityHeaders);
  // Thrown errors skip the middleware's post-next() header pass; the
  // error handler re-applies the security headers on those responses.
  app.onError(createSecureErrorHandler());
  app.use(
    "/api/*",
    csrfOriginCheck(() => resolveBaseUrl(database.db, config).origin),
  );
  app.use("/api/*", sessionMiddleware(database.db, now));

  const schedulerHealth = options.schedulerHealth ?? createSchedulerHealth();
  // Unauthenticated on purpose, so keep it minimal: statuses and
  // timestamps only, never emails, URLs, ids, or error text.
  app.get("/healthz", (c) =>
    c.json(buildHealthReport(database.db, schedulerHealth.read(), now())),
  );
  app.all(
    "/api/trpc/*",
    createTrpcHandler({
      config,
      database,
      key,
      now,
      loginRateLimiter,
      outboundFetch,
      syncRunner,
      notifier,
    }),
  );
  app.route(
    "/api/export",
    createExportRoutes({
      database,
      now,
      snapshotDir: options.exportSnapshotDir,
    }),
  );
  app.route(
    "/api/oauth",
    createOauthRoutes({ config, database, key, now, outboundFetch }),
  );
  app.get("*", createSpaHandler(options.webDistDir ?? defaultWebDistDir()));

  return app;
};
