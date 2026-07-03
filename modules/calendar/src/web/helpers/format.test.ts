// formatDateInZone assembles its result from formatToParts' labeled
// fields rather than a locale date string, so an exact YYYY-MM-DD match
// is safe here (unlike a locale-formatted string such as formatTime's
// output, which this suite never exact-matches).

import { describe, expect, test } from "bun:test";
import { formatDateInZone, minutesOfDayInZone } from "./format";

describe("minutesOfDayInZone", () => {
  test("returns an exact integer minute count for a known instant", () => {
    // 09:30 in Europe/London (BST, UTC+1) in July is 08:30 UTC.
    const epochMs = Date.UTC(2025, 6, 2, 8, 30, 0);
    expect(minutesOfDayInZone(epochMs, "Europe/London")).toBe(9 * 60 + 30);
  });

  test("crosses midnight correctly in a zone west of UTC", () => {
    // 22:00 UTC on the 1st is 18:00 in New York (EDT, UTC-4) the same day.
    const epochMs = Date.UTC(2025, 6, 1, 22, 0, 0);
    expect(minutesOfDayInZone(epochMs, "America/New_York")).toBe(18 * 60);
  });

  test("returns 0 at local midnight", () => {
    const epochMs = Date.UTC(2025, 0, 5, 0, 0, 0);
    expect(minutesOfDayInZone(epochMs, "UTC")).toBe(0);
  });
});

describe("formatDateInZone", () => {
  test("returns the local calendar date in a zone west of UTC", () => {
    // 2025-07-02T02:00:00Z is still 2025-07-01 in New York (UTC-4, EDT).
    const epochMs = Date.UTC(2025, 6, 2, 2, 0, 0);
    expect(formatDateInZone(epochMs, "America/New_York")).toBe("2025-07-01");
  });

  test("returns the calendar date for the same instant in a zone east of UTC", () => {
    const epochMs = Date.UTC(2025, 6, 2, 2, 0, 0);
    expect(formatDateInZone(epochMs, "Asia/Tokyo")).toBe("2025-07-02");
  });

  test("zero-pads single-digit months and days", () => {
    const epochMs = Date.UTC(2025, 0, 5, 12, 0, 0);
    expect(formatDateInZone(epochMs, "UTC")).toBe("2025-01-05");
  });
});
