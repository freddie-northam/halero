// The Progress module's server surface. A host-level router (it needs the
// encryption key + outbound fetch, which the module SDK withholds from
// module procedures). heatmap reads the local activity_daily table only, so
// it works offline; refresh is the sole network path.

import { dateStringInZone } from "@halero/connector-sdk";
import type { HaleroDatabase } from "@halero/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { densify, type HeatmapRange, rangeStart } from "../progress/date-range";
import { fetchGithubDaily, GITHUB_SOURCE_ID } from "../progress/sources";
import { computeStats } from "../progress/stats";
import { lastUpdatedAt, readRange, upsertDailyCounts } from "../progress/store";
import { deleteSetting, getSetting, setSetting } from "../settings";
import {
  getConnectionByConnectorId,
  parseConnectionConfig,
} from "../sync/connection";
import type { TrpcContext } from "./context";
import { protectedProcedure, router } from "./init";

const LAST_ERROR_KEY = "progress.github.lastError";

const homeTimezoneOf = (db: HaleroDatabase["db"]): string =>
  getSetting(db, "home_timezone") ?? "UTC";

const todayOf = (ctx: TrpcContext): string =>
  dateStringInZone(ctx.now(), homeTimezoneOf(ctx.db));

export const progressRouter = router({
  status: protectedProcedure.query(({ ctx }) => {
    const connection = getConnectionByConnectorId(ctx.db, GITHUB_SOURCE_ID);
    return {
      connected: connection !== null,
      login:
        connection === null
          ? null
          : (parseConnectionConfig(connection)?.email ?? null),
      lastSyncedAt: lastUpdatedAt(ctx.db, GITHUB_SOURCE_ID),
      lastError: getSetting(ctx.db, LAST_ERROR_KEY),
    };
  }),

  heatmap: protectedProcedure
    .input(z.object({ range: z.enum(["year", "6months", "month"]) }))
    .query(({ ctx, input }) => {
      const today = todayOf(ctx);
      const from = rangeStart(today, input.range as HeatmapRange);
      const rows = readRange(ctx.db, GITHUB_SOURCE_ID, from, today);
      const days = densify(rows, from, today);
      const stats = computeStats(days, today);
      return { from, to: today, today, days, ...stats };
    }),

  refresh: protectedProcedure.mutation(async ({ ctx }) => {
    const today = todayOf(ctx);
    let result: Awaited<ReturnType<typeof fetchGithubDaily>>;
    try {
      result = await fetchGithubDaily({
        db: ctx.db,
        key: ctx.key,
        fetch: ctx.outboundFetch,
        today,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim() !== ""
          ? error.message
          : "GitHub could not be refreshed. Try again shortly.";
      setSetting(ctx.db, LAST_ERROR_KEY, message);
      throw new TRPCError({ code: "BAD_REQUEST", message, cause: error });
    }
    if (result === null) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Connect GitHub in Settings before refreshing.",
      });
    }
    const now = ctx.now();
    upsertDailyCounts(ctx.db, GITHUB_SOURCE_ID, result.days, now);
    deleteSetting(ctx.db, LAST_ERROR_KEY);
    return {
      syncedDays: result.days.length,
      total: result.total,
      lastSyncedAt: now,
    };
  }),
});
