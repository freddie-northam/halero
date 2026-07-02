import { connections } from "@halero/db";
import { eq } from "drizzle-orm";
import type { Notifier } from "../notifier";
import { scheduleAfterRun } from "./backoff";
import {
  type SyncEngineContext,
  type SyncRunSummary,
  syncConnection,
} from "./engine";
import { pruneSyncRuns } from "./retention";

const ALREADY_RUNNING_MESSAGE =
  "A sync is already running for this connection. Wait for it to finish, " +
  "then try again.";

/** The streak length that triggers a "sync keeps failing" notification. */
const FAILURE_STREAK_THRESHOLD = 3;

export interface SyncRunnerContext extends SyncEngineContext {
  /** Random source in [0, 1) for reschedule jitter; tests pin it. */
  readonly random: () => number;
  /** Optional failure notifications; absent in most tests. */
  readonly notifier?: Notifier;
}

/**
 * The single run path shared by manual syncNow and the scheduler tick,
 * so both behave identically: same engine, same rescheduling, same
 * retention, same in-flight guard.
 */
export interface SyncRunner {
  readonly isRunning: (connectionId: string) => boolean;
  readonly runNow: (connectionId: string) => Promise<SyncRunSummary>;
}

/**
 * Reschedules after a finished run. Invariant (no bursts after
 * downtime): the next slot is always computed from now, never from the
 * stored next_sync_at, so a connection that was overdue for a week runs
 * once and moves on instead of replaying missed intervals.
 *
 * A connection that is no longer active (reauth_required) is never
 * rescheduled here; the reconnect path resets consecutive_failures and
 * next_sync_at when the account is signed in again.
 */
const rescheduleAfterRun = (
  ctx: SyncRunnerContext,
  connectionId: string,
  outcome: SyncRunSummary["status"],
): void => {
  const db = ctx.database.db;
  const row = db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .get();
  if (row === undefined || row.status !== "active") {
    return;
  }
  const next = scheduleAfterRun({
    outcome,
    now: ctx.now(),
    intervalSec: row.syncIntervalSec,
    previousFailures: row.consecutiveFailures,
    random: ctx.random,
  });
  db.update(connections)
    .set({
      consecutiveFailures: next.consecutiveFailures,
      nextSyncAt: next.nextSyncAt,
    })
    .where(eq(connections.id, connectionId))
    .run();
};

/**
 * Fires the operability notifications after a failed run. Exactly two
 * triggers, both once per episode:
 *
 * - the failure streak REACHING the threshold (not every run past it;
 *   a success resets the count, so the next streak notifies again),
 * - the run flipping the connection to reauth_required. Runs only start
 *   on active connections, so reaching that state here means THIS run
 *   caused the transition: structurally once.
 *
 * Fire and forget: send() never rejects, and a dead notification target
 * must never affect the sync path.
 */
const notifyAfterFailedRun = (
  ctx: SyncRunnerContext,
  connectionId: string,
  summary: SyncRunSummary,
): void => {
  if (ctx.notifier === undefined || summary.status !== "failed") {
    return;
  }
  const row = ctx.database.db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .get();
  if (row === undefined) {
    return;
  }
  const name = row.displayName ?? row.connectorId;
  if (row.status === "reauth_required") {
    void ctx.notifier.send({
      title: "Halero needs a reconnect",
      message:
        `${name} needs a fresh sign-in before syncing can continue. ` +
        "Open Settings and reconnect it.",
      connectorId: row.connectorId,
      status: "reauth_required",
    });
    return;
  }
  if (
    row.status === "active" &&
    row.consecutiveFailures === FAILURE_STREAK_THRESHOLD
  ) {
    void ctx.notifier.send({
      title: "Halero sync keeps failing",
      message:
        `${name} has failed ${FAILURE_STREAK_THRESHOLD} times in a row. ` +
        `Last error: ${summary.error ?? "unknown"}`,
      connectorId: row.connectorId,
      status: "failing",
    });
  }
};

export const createSyncRunner = (ctx: SyncRunnerContext): SyncRunner => {
  // One run per connection at a time, enforced in-process. Halero is a
  // single-process server, so a Set is the whole locking story; the DB
  // rows stay the durable queue.
  const inFlight = new Set<string>();

  const runNow = async (connectionId: string): Promise<SyncRunSummary> => {
    if (inFlight.has(connectionId)) {
      throw new Error(ALREADY_RUNNING_MESSAGE);
    }
    inFlight.add(connectionId);
    try {
      // Guard failures inside syncConnection (missing connection, reauth
      // required) throw before any run row exists and skip rescheduling.
      const summary = await syncConnection(ctx, connectionId);
      rescheduleAfterRun(ctx, connectionId, summary.status);
      pruneSyncRuns(ctx.database.db, connectionId);
      notifyAfterFailedRun(ctx, connectionId, summary);
      return summary;
    } finally {
      inFlight.delete(connectionId);
    }
  };

  return {
    isRunning: (connectionId) => inFlight.has(connectionId),
    runNow,
  };
};
