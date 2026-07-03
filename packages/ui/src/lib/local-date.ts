// The app's date convention is a "YYYY-MM-DD" string; react-day-picker's
// convention is a JS Date. These two helpers are the ONLY place that
// boundary gets crossed, and both anchor at local NOON rather than local
// midnight or UTC:
//
// - UTC midnight (`new Date(str)`, `date.toISOString()`) reads back as the
//   PREVIOUS day once you take its local calendar components in any
//   timezone west of Greenwich (negative UTC offset): local time there is
//   behind UTC, so UTC midnight has already rolled into yesterday locally.
// - Local midnight is safer than UTC, but a handful of timezones have
//   historically moved their clocks exactly at midnight, which can make
//   "local midnight" ambiguous or nonexistent on the transition day.
//
// Noon sits far enough from both edges that neither problem can reach it.

/** Parses a "YYYY-MM-DD" string into a Date at local noon on that day. */
export const parseLocalDate = (value: string): Date => {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

/** Reads a Date's LOCAL calendar day back into a "YYYY-MM-DD" string. */
export const formatLocalDate = (date: Date): string => {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
