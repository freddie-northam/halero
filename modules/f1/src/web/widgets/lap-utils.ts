// Pure lap-series helpers for the lap chart: find a driver's fastest lap
// and drop the laps that would distort a pace line (pit in/out laps,
// safety-car crawls, and any lap missing a time). Kept free of React so
// each helper is trivially unit tested.

import type { LapPoint } from "../../contract";

/** Laps slower than the fastest by more than this factor are outliers. */
export const OUTLIER_FACTOR = 1.15;

/** The quickest timed lap in a series, or null when none has a time. */
export const fastestLap = (laps: readonly LapPoint[]): number | null => {
  let best: number | null = null;
  for (const lap of laps) {
    if (lap.lapDuration === null || !Number.isFinite(lap.lapDuration)) {
      continue;
    }
    if (best === null || lap.lapDuration < best) {
      best = lap.lapDuration;
    }
  }
  return best;
};

/**
 * Whether a lap should be dropped from a pace line: it has no time, it is
 * an out lap, or it is more than OUTLIER_FACTOR slower than the fastest
 * (an in lap, a safety-car lap, or a mistake).
 */
export const isOutlierLap = (
  lap: LapPoint,
  fastest: number | null,
): boolean => {
  if (lap.lapDuration === null || !Number.isFinite(lap.lapDuration)) {
    return true;
  }
  if (lap.isPitOutLap) {
    return true;
  }
  if (fastest !== null && lap.lapDuration > fastest * OUTLIER_FACTOR) {
    return true;
  }
  return false;
};

/** A driver's laps with pit and outlier laps removed, for the pace line. */
export const filterRacingLaps = (
  laps: readonly LapPoint[],
): readonly LapPoint[] => {
  const fastest = fastestLap(laps);
  return laps.filter((lap) => !isOutlierLap(lap, fastest));
};
