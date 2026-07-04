// Pure helpers that turn tyre stints into horizontal bar geometry for the
// tyre-strategy widget: the shared lap range across every driver, and one
// stint's offset and width as percentages of that range. No React here so
// the mapping is unit tested on its own.

import type { DriverStints, Stint } from "../../contract";

/** The lap window a strategy chart spans, across every driver's stints. */
export interface LapRange {
  readonly start: number;
  readonly end: number;
}

/** A stint's placement on the bar, as percentages of the lap range. */
export interface StintBar {
  readonly offsetPct: number;
  readonly widthPct: number;
}

/** The min lap-start and max lap-end across all stints; {1,1} when empty. */
export const lapRange = (drivers: readonly DriverStints[]): LapRange => {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const driver of drivers) {
    for (const stint of driver.stints) {
      if (stint.lapStart !== null) {
        start = Math.min(start, stint.lapStart);
      }
      if (stint.lapEnd !== null) {
        end = Math.max(end, stint.lapEnd);
      }
    }
  }
  if (!Number.isFinite(start)) {
    start = 1;
  }
  if (!Number.isFinite(end) || end < start) {
    end = start;
  }
  return { start, end };
};

/**
 * One stint's bar geometry within the range, or null when the stint has
 * no known lap bounds. Widths are inclusive of both end laps, so a stint
 * that covers the whole range fills the bar.
 */
export const stintBar = (stint: Stint, range: LapRange): StintBar | null => {
  if (stint.lapStart === null || stint.lapEnd === null) {
    return null;
  }
  const total = range.end - range.start + 1;
  if (total <= 0) {
    return null;
  }
  const offsetPct = ((stint.lapStart - range.start) / total) * 100;
  const widthPct = ((stint.lapEnd - stint.lapStart + 1) / total) * 100;
  return { offsetPct, widthPct };
};
