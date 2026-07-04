// Range math for the heatmap. The store always holds a rolling year of
// daily counts; a range just slices it. Densifying fills gaps with explicit
// zeros so the grid and the streak math see a continuous series.

import { addDaysToDateString } from "@halero/connector-sdk";
import type { ActivityDay } from "./stats";
import type { DailyCount } from "./store";

export type HeatmapRange = "year" | "6months" | "month";

const RANGE_DAYS: Record<HeatmapRange, number> = {
  year: 365,
  "6months": 182,
  month: 30,
};

/** The inclusive first date of a range ending on `today` (YYYY-MM-DD). */
export const rangeStart = (today: string, range: HeatmapRange): string =>
  addDaysToDateString(today, -RANGE_DAYS[range]);

/** Fills every date in [from, to] inclusive, defaulting missing days to 0. */
export const densify = (
  rows: readonly DailyCount[],
  from: string,
  to: string,
): ActivityDay[] => {
  const byDate = new Map(rows.map((row) => [row.date, row.count]));
  const out: ActivityDay[] = [];
  for (
    let cursor = from;
    cursor <= to;
    cursor = addDaysToDateString(cursor, 1)
  ) {
    out.push({ date: cursor, count: byDate.get(cursor) ?? 0 });
  }
  return out;
};
