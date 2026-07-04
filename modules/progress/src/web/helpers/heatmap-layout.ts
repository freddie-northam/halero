// Pure layout maths for the contribution heatmap: how a count maps to a
// colour band, and how an ascending densified day list becomes GitHub-style
// week columns. Source-agnostic on purpose so the grid stays generic.

import type { HeatmapDay } from "../../contract";

/**
 * Buckets a day's count into 0..4 relative to the window's busiest day.
 * 0 is always "no contributions"; the rest split the range into quartiles
 * so the darkest band is reserved for the heaviest quarter, matching the
 * five-stop ramp the grid renders.
 */
export const colorLevel = (count: number, max: number): number => {
  if (count <= 0 || max <= 0) {
    return 0;
  }
  const ratio = count / max;
  if (ratio <= 0.25) {
    return 1;
  }
  if (ratio <= 0.5) {
    return 2;
  }
  if (ratio <= 0.75) {
    return 3;
  }
  return 4;
};

/** Sunday-indexed weekday (0..6) of a "YYYY-MM-DD" date, read in UTC. */
const weekdayOf = (date: string): number =>
  new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * Buckets an ascending, gap-free day list into columns of 7 (weeks). The
 * first column is padded at the top with nulls for the weekdays before the
 * first day, and the last column is padded at the bottom, so every row is a
 * fixed weekday (Sunday top) and columns read left-to-right as weeks.
 */
export const weeksFromDays = (
  days: readonly HeatmapDay[],
): (HeatmapDay | null)[][] => {
  const first = days[0];
  if (first === undefined) {
    return [];
  }
  const cells: (HeatmapDay | null)[] = [];
  for (let pad = 0; pad < weekdayOf(first.date); pad += 1) {
    cells.push(null);
  }
  for (const day of days) {
    cells.push(day);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  const weeks: (HeatmapDay | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) {
    weeks.push(cells.slice(start, start + 7));
  }
  return weeks;
};
