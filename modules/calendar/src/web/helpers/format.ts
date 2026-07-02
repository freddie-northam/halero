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
