import { modulesRouter } from "../registry";
import { authRouter } from "./auth-router";
import { connectionsRouter } from "./connections-router";
import { router } from "./init";
import { systemRouter } from "./system-router";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  connections: connectionsRouter,
  /** Module routers, one namespace per registered module id. */
  modules: modulesRouter,
});

export type AppRouter = typeof appRouter;
