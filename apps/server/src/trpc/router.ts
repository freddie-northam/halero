import { authRouter } from "./auth-router";
import { connectionsRouter } from "./connections-router";
import { router } from "./init";
import { systemRouter } from "./system-router";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  connections: connectionsRouter,
});

export type AppRouter = typeof appRouter;
