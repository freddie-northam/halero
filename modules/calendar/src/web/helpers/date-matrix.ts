// Pure calendar-date arithmetic on "YYYY-MM-DD" strings. Everything here
// only ARRANGES dates; the server owns all timezone math (day boundaries,
// DST) and the client renders what the server groups. Weeks start on
// Monday, hardcoded for the UK-based owner in v0.1; it becomes a setting
// later.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const parseDate = (date: string): number => Date.parse(`${date}T00:00:00Z`);

const formatDate = (epochMs: number): string =>
  new Date(epochMs).toISOString().slice(0, 10);

/** True only for well-formed, real calendar dates (no 31st of February). */
export const isCalendarDate = (value: string): boolean => {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = parseDate(value);
  // Some engines roll invalid components over (2023-02-31 -> March 3rd),
  // so a round-trip comparison is the reliable check.
  return !Number.isNaN(parsed) && formatDate(parsed) === value;
};

/** Pure calendar shift; no timezone involved. */
export const addDays = (date: string, days: number): string =>
  formatDate(parseDate(date) + days * DAY_MS);

/** ISO weekday, 1 (Monday) through 7 (Sunday). */
const isoWeekday = (date: string): number =>
  ((new Date(parseDate(date)).getUTCDay() + 6) % 7) + 1;

/** The Monday of the week containing the date (Monday-start weeks). */
export const mondayOf = (date: string): string =>
  addDays(date, 1 - isoWeekday(date));

/** The 7 dates of the Monday-start week containing the anchor. */
export const weekDates = (anchor: string): readonly string[] => {
  const monday = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
};

/** The "YYYY-MM" month a date belongs to. */
export const monthOf = (date: string): string => date.slice(0, 7);

/** The first of the month `months` steps away (day-of-month is dropped). */
export const addMonths = (date: string, months: number): string => {
  const year = Number(date.slice(0, 4));
  const monthIndex = Number(date.slice(5, 7)) - 1 + months;
  return formatDate(Date.UTC(year, monthIndex, 1));
};

/**
 * The fixed 6x7 month grid for the anchor's month: 42 consecutive dates
 * starting on the Monday of the week containing the 1st. Six rows always,
 * so the grid never changes height between months.
 */
export const monthMatrix = (anchor: string): readonly (readonly string[])[] => {
  const gridStart = mondayOf(`${monthOf(anchor)}-01`);
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(gridStart, week * 7 + day)),
  );
};
