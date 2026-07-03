// Intl formatting for the calendar views. Date strings are home-timezone
// calendar dates; formatting them as UTC midnights keeps labels on that
// exact date regardless of the browser's own timezone (the established
// agenda pattern). Times format in the home timezone directly.

const utcMidnight = (date: string): Date => new Date(`${date}T00:00:00Z`);

export const formatDayHeading = (date: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(utcMidnight(date));

export const formatTime = (epochMs: number, timeZone: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(epochMs);

/**
 * Minutes since local midnight for an instant in a given zone, parsed
 * from formatTime's "HH:MM" rather than any offset arithmetic on the
 * epoch (the week grid's only source of wall-clock minutes). Used to
 * position timed events in the hour-axis grid.
 */
export const minutesOfDayInZone = (
  epochMs: number,
  timeZone: string,
): number => {
  const [hoursText, minutesText] = formatTime(epochMs, timeZone).split(":");
  return Number(hoursText) * 60 + Number(minutesText);
};

/**
 * "YYYY-MM-DD" for that instant in that zone, assembled from the
 * formatter's own labeled parts rather than a locale date string (ICU's
 * string format differs across builds; the part types do not). Mirrors
 * the server's dateStringInZone, so the edit modal's prefill needs no
 * client-side timezone math of its own.
 */
export const formatDateInZone = (epochMs: number, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(epochMs);
  const part = (type: "year" | "month" | "day"): string =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

/** "July 2026" for the month view header. */
export const formatMonthLabel = (date: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcMidnight(date));

const dayAndMonth = (date: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(utcMidnight(date));

const dayMonthYear = (date: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcMidnight(date));

/** "29 Jun - 5 Jul 2026" (both years shown when they differ). */
export const formatDayRangeLabel = (first: string, last: string): string => {
  const start =
    first.slice(0, 4) === last.slice(0, 4)
      ? dayAndMonth(first)
      : dayMonthYear(first);
  return `${start} - ${dayMonthYear(last)}`;
};

/** "Mon" through "Sun" for column headers. */
export const formatWeekdayShort = (date: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  }).format(utcMidnight(date));

/** The day-of-month number for grid cells. */
export const dayOfMonth = (date: string): number => Number(date.slice(8, 10));
