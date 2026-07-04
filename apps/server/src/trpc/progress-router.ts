// The Progress module's server surface. A host-level router (it needs the
// encryption key + outbound fetch that module procedures do not get). It is
// source-agnostic: it iterates the activity-source registry, so adding a
// source (a file under progress/sources + a catalog entry) needs no change
// here. heatmap reads the local activity_daily table only, so it works
// offline; refresh is the sole network path.

import { homedir } from "node:os";
import { dateStringInZone } from "@halero/connector-sdk";
import type { HaleroDatabase } from "@halero/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getCatalogEntry } from "../connections/catalog";
import {
  isConnected,
  readConnectionToken,
} from "../connections/connection-token";
import { densify, type HeatmapRange, rangeStart } from "../progress/date-range";
import {
  fetchAssignedIssues,
  fetchMyPullRequests,
  fetchRepositories,
  fetchReviewRequests,
  GithubScopeError,
} from "../progress/github-work";
import type { ActivitySourceContext } from "../progress/source";
import { ACTIVITY_SOURCES } from "../progress/sources";
import { computeStats } from "../progress/stats";
import {
  lastUpdatedAt,
  readMergedRange,
  readRange,
  upsertDailyCounts,
} from "../progress/store";
import { deleteSetting, getSetting, setSetting } from "../settings";
import type { TrpcContext } from "./context";
import { protectedProcedure, router } from "./init";

const lastErrorKey = (sourceId: string): string =>
  `progress.${sourceId}.lastError`;

const homeTimezoneOf = (db: HaleroDatabase["db"]): string =>
  getSetting(db, "home_timezone") ?? "UTC";

const todayOf = (ctx: TrpcContext): string =>
  dateStringInZone(ctx.now(), homeTimezoneOf(ctx.db));

const connectedSourceIds = (ctx: TrpcContext): string[] =>
  ACTIVITY_SOURCES.filter((source) => isConnected(ctx.db, source.id)).map(
    (source) => source.id,
  );

/** Connected source ids, optionally narrowed to one catalog category. */
const sourcesFor = (ctx: TrpcContext, category?: string): string[] =>
  connectedSourceIds(ctx).filter(
    (id) =>
      category === undefined || getCatalogEntry(id)?.category === category,
  );

const GITHUB_ID = "github";

/**
 * Runs a live GitHub read with the stored token: returns { connected:false }
 * when GitHub is not connected, throws FORBIDDEN (reconnect) when the token
 * lacks scope, and BAD_REQUEST on other failures.
 */
const githubWork = async <T>(
  ctx: TrpcContext,
  fetcher: (fetch: TrpcContext["outboundFetch"], token: string) => Promise<T[]>,
): Promise<{ connected: boolean; items: T[] }> => {
  const token = readConnectionToken(ctx.db, ctx.key, GITHUB_ID);
  if (token === null) {
    return { connected: false, items: [] };
  }
  try {
    return { connected: true, items: await fetcher(ctx.outboundFetch, token) };
  } catch (error) {
    if (error instanceof GithubScopeError) {
      throw new TRPCError({ code: "FORBIDDEN", message: error.message });
    }
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        error instanceof Error && error.message.trim() !== ""
          ? error.message
          : "GitHub request failed.",
      cause: error,
    });
  }
};

const heatmapRangeSchema = z.enum(["year", "6months", "month"]);

export const progressRouter = router({
  /** Per-source connection + freshness, for the source selector and status. */
  status: protectedProcedure.query(({ ctx }) => ({
    sources: ACTIVITY_SOURCES.map((source) => ({
      id: source.id,
      displayName: getCatalogEntry(source.id)?.displayName ?? source.id,
      category: getCatalogEntry(source.id)?.category ?? null,
      connected: isConnected(ctx.db, source.id),
      lastSyncedAt: lastUpdatedAt(ctx.db, source.id),
      lastError: getSetting(ctx.db, lastErrorKey(source.id)),
    })),
  })),

  /**
   * Activity headline for the Developer page: totals + streaks over the
   * connected developer-category sources, plus a per-source breakdown.
   */
  summary: protectedProcedure
    .input(z.object({ range: heatmapRangeSchema }))
    .query(({ ctx, input }) => {
      const today = todayOf(ctx);
      const from = rangeStart(today, input.range as HeatmapRange);
      const devIds = sourcesFor(ctx, "developer");
      const bySource = devIds.map((id) => ({
        id,
        displayName: getCatalogEntry(id)?.displayName ?? id,
        total: readRange(ctx.db, id, from, today).reduce(
          (sum, row) => sum + row.count,
          0,
        ),
      }));
      const days = densify(
        readMergedRange(ctx.db, devIds, from, today),
        from,
        today,
      );
      return { ...computeStats(days, today), bySource };
    }),

  /** Pull requests where my review is requested (live GitHub read). */
  reviewRequests: protectedProcedure.query(({ ctx }) =>
    githubWork(ctx, fetchReviewRequests),
  ),
  /** My open pull requests with review + CI state (live GitHub read). */
  myOpenPullRequests: protectedProcedure.query(({ ctx }) =>
    githubWork(ctx, fetchMyPullRequests),
  ),
  /** Issues assigned to me (live GitHub read). */
  assignedIssues: protectedProcedure.query(({ ctx }) =>
    githubWork(ctx, fetchAssignedIssues),
  ),
  /** Per-repo contribution totals (live GitHub read). */
  repositories: protectedProcedure.query(({ ctx }) =>
    githubWork(ctx, fetchRepositories),
  ),

  /**
   * A heatmap for one source, or the merged total across every connected
   * source when `source` is omitted or "all". Reads activity_daily only.
   */
  heatmap: protectedProcedure
    .input(
      z.object({
        range: heatmapRangeSchema,
        source: z.string().min(1).optional(),
        // Narrows the merged "all" view to one catalog category (the
        // Developer page passes "developer").
        category: z.string().min(1).optional(),
      }),
    )
    .query(({ ctx, input }) => {
      const today = todayOf(ctx);
      const from = rangeStart(today, input.range as HeatmapRange);
      const rows =
        input.source === undefined || input.source === "all"
          ? readMergedRange(
              ctx.db,
              sourcesFor(ctx, input.category),
              from,
              today,
            )
          : readRange(ctx.db, input.source, from, today);
      const days = densify(rows, from, today);
      const stats = computeStats(days, today);
      return {
        source: input.source ?? "all",
        from,
        to: today,
        today,
        days,
        ...stats,
      };
    }),

  /** Refreshes every connected source; one source failing never fails the rest. */
  refresh: protectedProcedure.mutation(async ({ ctx }) => {
    const today = todayOf(ctx);
    const sourceCtx: ActivitySourceContext = {
      db: ctx.db,
      key: ctx.key,
      fetch: ctx.outboundFetch,
      now: ctx.now,
      today,
      homeTimezone: homeTimezoneOf(ctx.db),
      homeDir: homedir(),
    };
    const now = ctx.now();
    const results: {
      id: string;
      syncedDays: number;
      total: number;
      error: string | null;
    }[] = [];
    for (const source of ACTIVITY_SOURCES) {
      if (!isConnected(ctx.db, source.id)) {
        continue;
      }
      try {
        const data = await source.readDaily(sourceCtx);
        if (data === null) {
          results.push({ id: source.id, syncedDays: 0, total: 0, error: null });
          continue;
        }
        upsertDailyCounts(ctx.db, source.id, data.days, now);
        deleteSetting(ctx.db, lastErrorKey(source.id));
        results.push({
          id: source.id,
          syncedDays: data.days.length,
          total: data.total,
          error: null,
        });
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim() !== ""
            ? error.message
            : `${source.id} could not be refreshed.`;
        setSetting(ctx.db, lastErrorKey(source.id), message);
        results.push({
          id: source.id,
          syncedDays: 0,
          total: 0,
          error: message,
        });
      }
    }
    if (results.length === 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Connect a source in Settings before refreshing.",
      });
    }
    return { lastSyncedAt: now, sources: results };
  }),
});
