// Pure activity-series analytics for the Progress heatmap. `today` is
// always injected (never Date.now()) so streak math is deterministic.

/** One day of activity. `date` is a 'YYYY-MM-DD' calendar day (UTC). */
export interface ActivityDay {
  readonly date: string;
  readonly count: number;
}

export interface ActivityStats {
  readonly total: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
}

/** The UTC calendar day before `date`, formatted 'YYYY-MM-DD'. */
const stepBack = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);

/** Longest run of consecutive calendar days with count > 0. */
const longestRun = (days: readonly ActivityDay[]): number => {
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const { date, count } of days) {
    if (count > 0) {
      const consecutive = previous !== null && stepBack(date) === previous;
      run = consecutive ? run + 1 : 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
    previous = date;
  }
  return longest;
};

/**
 * Streak ending at `today`, walking backward until the first empty day.
 * A count of 0 on `today` means the day is still in progress, so the
 * walk starts from yesterday and an unfinished day never resets it.
 */
const currentRun = (counts: Map<string, number>, today: string): number => {
  let cursor = (counts.get(today) ?? 0) > 0 ? today : stepBack(today);
  let streak = 0;
  while ((counts.get(cursor) ?? 0) > 0) {
    streak += 1;
    cursor = stepBack(cursor);
  }
  return streak;
};

export const computeStats = (
  days: readonly ActivityDay[],
  today: string,
): ActivityStats => {
  const counts = new Map<string, number>();
  let total = 0;
  for (const { date, count } of days) {
    counts.set(date, count);
    total += count;
  }
  return {
    total,
    currentStreak: currentRun(counts, today),
    longestStreak: longestRun(days),
  };
};
