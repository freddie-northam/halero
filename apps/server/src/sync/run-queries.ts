// Read-side queries over sync_runs shared by the connection status
// endpoint and /healthz.

import { type HaleroDatabase, syncRuns } from "@halero/db";
import { and, desc, eq } from "drizzle-orm";

type Db = HaleroDatabase["db"];

/** One sync run as surfaced to the UI. */
export interface SyncRunView {
  readonly startedAt: number;
  readonly finishedAt: number | null;
  readonly status: string;
  readonly upserts: number;
  readonly deletes: number;
  readonly error: string | null;
}

/** The connection's newest runs, newest first. */
export const readRecentRuns = (
  db: Db,
  connectionId: string,
  limit: number,
): SyncRunView[] =>
  db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.connectionId, connectionId))
    .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
    .limit(limit)
    .all()
    .map((run) => ({
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      status: run.status,
      upserts: run.upserts,
      deletes: run.deletes,
      error: run.error,
    }));

/** When the most recent successful run finished, or null before one. */
export const readLastSuccessAt = (
  db: Db,
  connectionId: string,
): number | null =>
  db
    .select({ finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.connectionId, connectionId),
        eq(syncRuns.status, "success"),
      ),
    )
    .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
    .limit(1)
    .get()?.finishedAt ?? null;
