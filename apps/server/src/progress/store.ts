// Persistence for per-source daily activity counts. Writes are
// idempotent upserts keyed on (source, date); reads are date-bounded and
// ascending. Dates are 'YYYY-MM-DD', so string comparison orders them.

import { activityDaily, type HaleroDatabase } from "@halero/db";
import { and, asc, eq, gte, lte } from "drizzle-orm";

type Db = HaleroDatabase["db"];

/** One day of activity as stored/read (source is implied by the query). */
export interface DailyCount {
  readonly date: string;
  readonly count: number;
}

/**
 * Idempotently upsert a batch of daily counts for one source in a single
 * transaction, stamping updatedAt=now. Re-running with the same dates
 * overwrites the counts (never accumulates).
 */
export const upsertDailyCounts = (
  db: Db,
  source: string,
  days: readonly DailyCount[],
  now: number,
): void => {
  if (days.length === 0) return;
  db.transaction((tx) => {
    for (const { date, count } of days) {
      tx.insert(activityDaily)
        .values({ source, date, count, updatedAt: now })
        .onConflictDoUpdate({
          target: [activityDaily.source, activityDaily.date],
          set: { count, updatedAt: now },
        })
        .run();
    }
  });
};

/** Counts for a source within [from, to] inclusive, ascending by date. */
export const readRange = (
  db: Db,
  source: string,
  from: string,
  to: string,
): DailyCount[] =>
  db
    .select({ date: activityDaily.date, count: activityDaily.count })
    .from(activityDaily)
    .where(
      and(
        eq(activityDaily.source, source),
        gte(activityDaily.date, from),
        lte(activityDaily.date, to),
      ),
    )
    .orderBy(asc(activityDaily.date))
    .all();
