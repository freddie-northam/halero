import { authRouter } from "./auth-router";
import { calendarRouter } from "./calendar-router";
import { connectionsRouter } from "./connections-router";
import { router } from "./init";
import { systemRouter } from "./system-router";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  connections: connectionsRouter,
  calendar: calendarRouter,
});

export type AppRouter = typeof appRouter;
