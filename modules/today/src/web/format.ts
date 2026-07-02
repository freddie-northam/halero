/**
 * "Thursday, 2 July 2026" for the line under the greeting. The input is
 * a home-timezone calendar date string from the server; formatting its
 * UTC midnight keeps the label on that exact date regardless of the
 * browser's own timezone (the calendar module's established pattern).
 */
export const formatFullDate = (date: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
