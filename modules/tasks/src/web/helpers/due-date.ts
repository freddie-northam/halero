// Due-date presentation helpers. Both sides of every comparison are
// server-derived home-timezone calendar dates ("YYYY-MM-DD"), so plain
// lexicographic ordering is correct and the client never does timezone
// math or reads its own clock.

const utcMidnight = (date: string): Date => new Date(`${date}T00:00:00Z`);

/**
 * Whether an open task's due date deserves the destructive tint: due
 * today or overdue relative to the server-computed today.
 */
export const isDueOrOverdue = (
  dueDate: string | null,
  today: string,
): boolean => dueDate !== null && dueDate <= today;

/**
 * "2 Jul" within today's year, "31 Dec 2024" outside it. Formatting at
 * UTC midnight keeps the label on that exact calendar date regardless
 * of the browser's own timezone (the calendar module's pattern).
 */
export const formatDueDate = (date: string, today: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(utcMidnight(date));
