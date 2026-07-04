import { f1LiveRouter } from "../f1-live/router";
import { modulesRouter } from "../registry";
import { agentsRouter } from "./agents-router";
import { authRouter } from "./auth-router";
import { connectionsRouter } from "./connections-router";
import { router } from "./init";
import { linksRouter } from "./links-router";
import { notificationsRouter } from "./notifications-router";
import { progressRouter } from "./progress-router";
import { systemRouter } from "./system-router";
import { tokensRouter } from "./tokens-router";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  agents: agentsRouter,
  connections: connectionsRouter,
  links: linksRouter,
  f1Live: f1LiveRouter,
  notifications: notificationsRouter,
  progress: progressRouter,
  tokens: tokensRouter,
  /** Module routers, one namespace per registered module id. */
  modules: modulesRouter,
});

export type AppRouter = typeof appRouter;
