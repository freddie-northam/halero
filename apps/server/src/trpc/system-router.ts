import { dateStringInZone } from "@halero/connector-sdk";
import { searchEntities } from "@halero/core";
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
  name: z
    .string()
    .trim()
    .min(1, "Please enter your name.")
    .max(80, "Your name is limited to 80 characters.")
    .optional(),
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

const SEARCH_LIMIT_MESSAGE =
  "Search can return between 1 and 50 results at a time.";

const searchInput = z.object({
  query: z
    .string()
    .trim()
    .max(200, "Search terms are limited to 200 characters."),
  kind: z.string().optional(),
  limit: z
    .number()
    .int(SEARCH_LIMIT_MESSAGE)
    .min(1, SEARCH_LIMIT_MESSAGE)
    .max(50, SEARCH_LIMIT_MESSAGE)
    .optional(),
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
    // Only surfaced once signed in: the owner's name is not leaked to an
    // unauthenticated visitor of a hosted instance.
    displayName:
      ctx.session !== null ? getSetting(ctx.db, "display_name") : null,
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
      if (input.name !== undefined) {
        setSetting(ctx.db, "display_name", input.name);
      }
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

  search: protectedProcedure.input(searchInput).query(({ ctx, input }) => {
    // Dates are derived here in the home timezone so the client never
    // does timezone math; a hit with no occurred time has a null date.
    const homeTimezone = getSetting(ctx.db, "home_timezone") ?? "UTC";
    const hits = searchEntities(ctx.sqlite, input);
    return {
      results: hits.map((hit) => ({
        ...hit,
        occurredDate:
          hit.occurredStart === null
            ? null
            : dateStringInZone(hit.occurredStart, homeTimezone),
      })),
    };
  }),

  setBaseUrl: protectedProcedure
    .input(setBaseUrlInput)
    .mutation(({ ctx, input }) => {
      // The single base-URL authority resolves per request, so CSRF's
      // allowed origin and the OAuth redirect URI follow immediately.
      setSetting(ctx.db, "base_url", input.baseUrl);
      return { ok: true };
    }),
});
