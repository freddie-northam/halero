import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSession, hashPassword } from "../auth";
import { isParseableUrl } from "../config";
import { getSetting, setSetting } from "../settings";
import { publicProcedure, router } from "./init";

const isValidTimezone = (timeZone: string): boolean => {
  try {
    return Boolean(new Intl.DateTimeFormat("en-US", { timeZone }));
  } catch {
    return false;
  }
};

const setupInput = z.object({
  password: z
    .string()
    .min(8, "Your password must be at least 8 characters long."),
  homeTimezone: z
    .string()
    .refine(
      isValidTimezone,
      'Home timezone must be a valid IANA timezone name, like "Europe/London".',
    ),
  baseUrl: z
    .string()
    .refine(
      isParseableUrl,
      'Base URL must be a full URL, like "https://halero.example.com".',
    )
    .optional(),
});

export const systemRouter = router({
  status: publicProcedure.query(({ ctx }) => ({
    needsSetup: getSetting(ctx.db, "setup_complete") === null,
    authenticated: ctx.session !== null,
  })),

  setup: publicProcedure.input(setupInput).mutation(async ({ ctx, input }) => {
    if (getSetting(ctx.db, "setup_complete") !== null) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Setup has already been completed. Sign in with your password instead.",
      });
    }
    const passwordHash = await hashPassword(input.password);
    setSetting(ctx.db, "password_hash", passwordHash);
    setSetting(ctx.db, "home_timezone", input.homeTimezone);
    if (input.baseUrl !== undefined) {
      setSetting(ctx.db, "base_url", input.baseUrl);
    }
    setSetting(ctx.db, "setup_complete", "1");
    ctx.setSessionCookie(createSession(ctx.db, ctx.now()));
    return { ok: true };
  }),
});
