import { type HaleroDatabase, syncRuns } from "@halero/db";
import { and, desc, eq, notInArray } from "drizzle-orm";

type Db = HaleroDatabase["db"];

/** How many of a connection's newest sync_runs rows survive pruning. */
export const RETAINED_RUNS = 20;

/**
 * Prunes one connection's sync_runs down to the newest RETAINED_RUNS
 * rows. The most recent failed run is always kept as well, even when it
 * is older than the retention window, so the last error stays
 * diagnosable after a long healthy streak.
 *
 * A run row is still written for every run; coalescing consecutive
 * no-op rows into one is an explicitly deferred optimization.
 */
export const pruneSyncRuns = (db: Db, connectionId: string): void => {
  const newest = db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(eq(syncRuns.connectionId, connectionId))
    .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
    .limit(RETAINED_RUNS)
    .all();
  const lastFailed = db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.connectionId, connectionId),
        eq(syncRuns.status, "failed"),
      ),
    )
    .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
    .limit(1)
    .get();
  const keepIds = new Set(newest.map((row) => row.id));
  if (lastFailed !== undefined) {
    keepIds.add(lastFailed.id);
  }
  db.delete(syncRuns)
    .where(
      and(
        eq(syncRuns.connectionId, connectionId),
        notInArray(syncRuns.id, [...keepIds]),
      ),
    )
    .run();
};
