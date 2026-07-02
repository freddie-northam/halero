import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createSession,
  destroySession,
  RATE_LIMIT_MESSAGE,
  verifyPassword,
} from "../auth";
import { getSetting } from "../settings";
import { protectedProcedure, publicProcedure, router } from "./init";

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const now = ctx.now();
      if (ctx.loginRateLimiter.isBlocked(now)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: RATE_LIMIT_MESSAGE,
        });
      }
      const passwordHash = getSetting(ctx.db, "password_hash");
      if (passwordHash === null) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This Halero instance has not been set up yet. Complete setup first.",
        });
      }
      const matches = await verifyPassword(input.password, passwordHash);
      if (!matches) {
        ctx.loginRateLimiter.recordFailure(now);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Incorrect password. Please try again.",
        });
      }
      ctx.setSessionCookie(createSession(ctx.db, now));
      return { ok: true };
    }),

  logout: protectedProcedure.mutation(({ ctx }) => {
    if (ctx.sessionToken !== null) {
      destroySession(ctx.db, ctx.sessionToken);
    }
    ctx.clearSessionCookie();
    return { ok: true };
  }),
});
