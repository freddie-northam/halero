import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSession, hashPassword } from "../auth";
import { resolveBaseUrl } from "../base-url";
import { isHttpUrl } from "../config";
import { getSetting, setSetting } from "../settings";
import { protectedProcedure, publicProcedure, router } from "./init";

const isValidTimezone = (timeZone: string): boolean => {
  try {
    return Boolean(new Intl.DateTimeFormat("en-US", { timeZone }));
  } catch {
    return false;
  }
};

const BASE_URL_MESSAGE =
  "Base URL must be a full URL starting with http:// or https://, " +
  'like "https://halero.example.com".';

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
  baseUrl: z.string().refine(isHttpUrl, BASE_URL_MESSAGE).optional(),
});

const setBaseUrlInput = z.object({
  baseUrl: z.string().trim().refine(isHttpUrl, BASE_URL_MESSAGE),
});

const setupAlreadyCompleted = (): TRPCError =>
  new TRPCError({
    code: "FORBIDDEN",
    message:
      "Setup has already been completed. Sign in with your password instead.",
  });

export const systemRouter = router({
  status: publicProcedure.query(({ ctx }) => ({
    needsSetup: getSetting(ctx.db, "setup_complete") === null,
    authenticated: ctx.session !== null,
  })),

  setup: publicProcedure.input(setupInput).mutation(async ({ ctx, input }) => {
    const isComplete = (): boolean =>
      getSetting(ctx.db, "setup_complete") !== null;
    if (isComplete()) {
      throw setupAlreadyCompleted();
    }
    const passwordHash = await hashPassword(input.password);
    // Hashing yields the event loop, so a concurrent setup call may have
    // finished while this one waited: re-check atomically with the write
    // so only one call can ever complete setup.
    ctx.sqlite.transaction(() => {
      if (isComplete()) {
        throw setupAlreadyCompleted();
      }
      setSetting(ctx.db, "password_hash", passwordHash);
      setSetting(ctx.db, "home_timezone", input.homeTimezone);
      if (input.baseUrl !== undefined) {
        setSetting(ctx.db, "base_url", input.baseUrl);
      }
      setSetting(ctx.db, "setup_complete", "1");
    })();
    ctx.setSessionCookie(createSession(ctx.db, ctx.now()));
    return { ok: true };
  }),

  baseUrl: protectedProcedure.query(({ ctx }) => ({
    url: resolveBaseUrl(ctx.db, ctx.config).toString(),
  })),

  setBaseUrl: protectedProcedure
    .input(setBaseUrlInput)
    .mutation(({ ctx, input }) => {
      // The single base-URL authority resolves per request, so CSRF's
      // allowed origin and the OAuth redirect URI follow immediately.
      setSetting(ctx.db, "base_url", input.baseUrl);
      return { ok: true };
    }),
});
