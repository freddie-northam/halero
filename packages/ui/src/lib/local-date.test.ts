// The DatePicker boundary (packages/ui/src/components/date-picker.tsx) is
// the only place react-day-picker's Date objects meet the app's
// "YYYY-MM-DD" string convention. These round-trip helpers are what keep
// that boundary honest across every timezone the browser might run in.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { formatLocalDate, parseLocalDate } from "./local-date";

// The real-world UTC offset extremes: Midway sits at UTC-11 (as far west
// as the tz database goes) and Kiritimati at UTC+14 (as far east), so a
// helper that survives both survives every timezone in between.
const WESTMOST_TZ = "Pacific/Midway";
const EASTMOST_TZ = "Pacific/Kiritimati";

const withTimeZone = (timeZone: string, run: () => void): void => {
  const original = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    run();
  } finally {
    process.env.TZ = original;
  }
};

describe("a naive new Date(str) is off-by-one in western timezones", () => {
  // This documents the bug the DatePicker boundary must not reintroduce:
  // parsing a date-only ISO string yields UTC midnight, and reading it
  // back through LOCAL getters rolls the day back west of Greenwich.
  test("regression guard: the naive approach fails in Pacific/Midway", () => {
    withTimeZone(WESTMOST_TZ, () => {
      const naive = new Date("2026-07-03");
      expect(naive.getDate()).not.toBe(3);
    });
  });
});

describe("parseLocalDate", () => {
  test("reads the calendar day back out regardless of timezone", () => {
    for (const timeZone of [WESTMOST_TZ, "UTC", EASTMOST_TZ]) {
      withTimeZone(timeZone, () => {
        const date = parseLocalDate("2026-07-03");
        expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([
          2026, 6, 3,
        ]);
      });
    }
  });
});

describe("formatLocalDate", () => {
  test("pads single-digit months and days", () => {
    expect(formatLocalDate(new Date(2026, 0, 5, 12, 0, 0))).toBe("2026-01-05");
  });

  test("formats a late-year date", () => {
    expect(formatLocalDate(new Date(2025, 11, 31, 12, 0, 0))).toBe(
      "2025-12-31",
    );
  });
});

describe("parseLocalDate / formatLocalDate round-trip", () => {
  let originalTz: string | undefined;

  beforeEach(() => {
    originalTz = process.env.TZ;
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  const dates = ["2026-07-03", "2026-01-01", "2025-12-31", "2024-02-29"];

  for (const timeZone of [WESTMOST_TZ, "UTC", EASTMOST_TZ]) {
    test(`round-trips every sample date under ${timeZone}`, () => {
      process.env.TZ = timeZone;
      for (const value of dates) {
        expect(formatLocalDate(parseLocalDate(value))).toBe(value);
      }
    });
  }
});
