import { connections, type HaleroDatabase } from "@halero/db";
import { Cron } from "croner";
import { and, asc, eq, lte } from "drizzle-orm";
import type { SchedulerHealth } from "../healthz";
import type { MaintenanceJob } from "./maintenance";
import type { SyncRunner } from "./runner";

type Db = HaleroDatabase["db"];

const DEFAULT_TICK_INTERVAL_SECONDS = 30;

export interface SchedulerContext {
  readonly db: Db;
  readonly now: () => number;
  readonly runner: SyncRunner;
  /** Liveness state read by /healthz; optional so tests can omit it. */
  readonly health?: SchedulerHealth;
}

export interface SchedulerOptions {
  readonly intervalSeconds?: number;
  /**
   * Daily maintenance (backups) sharing the scheduler's lifecycle: one
   * switch starts and stops all background work.
   */
  readonly maintenance?: MaintenanceJob;
}

export interface SyncScheduler {
  readonly start: () => void;
  readonly stop: () => void;
  readonly isRunning: () => boolean;
}

/**
 * The DB rows are the queue: a connection is due when it is active and
 * its next_sync_at has passed. reauth_required connections fall out of
 * the filter entirely; only a reconnect (which resets their scheduling
 * fields) brings them back.
 */
export const findDueConnectionIds = (db: Db, now: number): string[] =>
  db
    .select({ id: connections.id })
    .from(connections)
    .where(
      and(eq(connections.status, "active"), lte(connections.nextSyncAt, now)),
    )
    .orderBy(asc(connections.nextSyncAt))
    .all()
    .map((row) => row.id);

const readableTickError = (error: unknown): string =>
  error instanceof Error && error.message.trim() !== ""
    ? error.message
    : "The scheduled sync failed for an unknown reason.";

/**
 * One scheduler pass: claim every due connection and run it through the
 * SAME runner manual syncNow uses, so scheduled and manual syncs cannot
 * drift apart. A connection overdue for a week runs ONCE here and is
 * rescheduled from now by the runner (the no-burst invariant); missed
 * intervals are never replayed.
 *
 * Runs are sequential, which satisfies the concurrency contract of at
 * most 2 connections syncing at once.
 */
export const runSchedulerTick = async (
  ctx: SchedulerContext,
): Promise<void> => {
  ctx.health?.recordTick(ctx.now());
  for (const connectionId of findDueConnectionIds(ctx.db, ctx.now())) {
    if (ctx.runner.isRunning(connectionId)) {
      // Already syncing (a manual run or a long previous tick): skip
      // silently; the connection reschedules itself when it finishes.
      continue;
    }
    try {
      await ctx.runner.runNow(connectionId);
    } catch (error) {
      // Guard rejections (connection deleted or flipped mid-tick) must
      // not take down the loop for the remaining connections.
      console.error(
        "Scheduled sync could not start:",
        readableTickError(error),
      );
    }
  }
};

/**
 * In-process scheduler driving runSchedulerTick on a fixed cadence.
 * Created in main.ts after boot; never started by createApp or tests.
 */
export const createScheduler = (
  ctx: SchedulerContext,
  options: SchedulerOptions = {},
): SyncScheduler => {
  const intervalSeconds =
    options.intervalSeconds ?? DEFAULT_TICK_INTERVAL_SECONDS;
  // Croner jobs cannot restart after stop(), so start() builds a fresh
  // job each time.
  let job: Cron | null = null;
  return {
    start: () => {
      if (job !== null && !job.isStopped()) {
        return;
      }
      options.maintenance?.start();
      ctx.health?.markStarted(ctx.now());
      // The every-second pattern gated by `interval` yields one tick per
      // intervalSeconds; `protect` skips a tick while the previous one
      // is still running instead of overlapping it.
      job = new Cron(
        "* * * * * *",
        { interval: intervalSeconds, protect: true },
        () =>
          runSchedulerTick(ctx).catch((error: unknown) => {
            console.error(
              "The sync scheduler tick failed:",
              readableTickError(error),
            );
          }),
      );
    },
    stop: () => {
      options.maintenance?.stop();
      ctx.health?.markStopped();
      job?.stop();
      job = null;
    },
    isRunning: () => job !== null && !job.isStopped(),
  };
};
