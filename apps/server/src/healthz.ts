// /healthz support: in-process scheduler liveness plus a minimal,
// unauthenticated health report. Silent sync death is the classic
// self-hosted failure, so the endpoint says "degraded" as soon as a
// connection is stuck or the scheduler stops ticking.

import { connections, type HaleroDatabase } from "@halero/db";
import { readLastSuccessAt } from "./sync/run-queries";

type Db = HaleroDatabase["db"];

/** A running scheduler silent for longer than this is degraded. */
const STALE_TICK_MS = 5 * 60_000;

/** Failure streak length that flips the report to degraded. */
const DEGRADED_FAILURE_STREAK = 3;

export interface SchedulerHealthSnapshot {
  readonly running: boolean;
  readonly startedAt: number | null;
  readonly lastTickAt: number | null;
}

/**
 * Where the scheduler records its liveness for the /healthz route.
 *
 * Restart semantics: this state is in-process only and resets with the
 * server. After a restart /healthz reports lastTickAt: null and cannot
 * call the scheduler stale until it has been started and then silent
 * for the threshold again. Deliberate: a freshly restarted server is
 * healthy until proven otherwise.
 */
export interface SchedulerHealth {
  readonly markStarted: (at: number) => void;
  readonly markStopped: () => void;
  readonly recordTick: (at: number) => void;
  readonly read: () => SchedulerHealthSnapshot;
}

export const createSchedulerHealth = (): SchedulerHealth => {
  let running = false;
  let startedAt: number | null = null;
  let lastTickAt: number | null = null;
  return {
    markStarted: (at) => {
      running = true;
      startedAt = at;
    },
    markStopped: () => {
      running = false;
    },
    recordTick: (at) => {
      lastTickAt = at;
    },
    read: () => ({ running, startedAt, lastTickAt }),
  };
};

/** Minimal by design: no emails, no URLs, no ids, no error text. */
export interface HealthReportConnection {
  readonly connectorId: string;
  readonly status: string;
  readonly lastSuccessAt: number | null;
}

export interface HealthReport {
  readonly status: "ok" | "degraded";
  readonly lastTickAt: number | null;
  readonly connections: readonly HealthReportConnection[];
}

const isSchedulerStale = (
  snapshot: SchedulerHealthSnapshot,
  now: number,
): boolean => {
  if (!snapshot.running) {
    return false;
  }
  // A started-but-never-ticked scheduler goes stale from its start time.
  const reference = snapshot.lastTickAt ?? snapshot.startedAt;
  return reference !== null && now - reference > STALE_TICK_MS;
};

export const buildHealthReport = (
  db: Db,
  snapshot: SchedulerHealthSnapshot,
  now: number,
): HealthReport => {
  const rows = db.select().from(connections).all();
  const unhealthy = rows.some(
    (row) =>
      row.status === "reauth_required" ||
      row.consecutiveFailures >= DEGRADED_FAILURE_STREAK,
  );
  return {
    status: unhealthy || isSchedulerStale(snapshot, now) ? "degraded" : "ok",
    lastTickAt: snapshot.lastTickAt,
    connections: rows.map((row) => ({
      connectorId: row.connectorId,
      status: row.status,
      lastSuccessAt: readLastSuccessAt(db, row.id),
    })),
  };
};
