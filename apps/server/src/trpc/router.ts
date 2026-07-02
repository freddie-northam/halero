import { authRouter } from "./auth-router";
import { router } from "./init";
import { systemRouter } from "./system-router";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
