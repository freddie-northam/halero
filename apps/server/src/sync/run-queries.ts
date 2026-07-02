// Read-side queries over sync_runs shared by the connection status
// endpoint and /healthz.

import { type HaleroDatabase, syncRuns } from "@halero/db";
import { and, desc, eq } from "drizzle-orm";

type Db = HaleroDatabase["db"];

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
