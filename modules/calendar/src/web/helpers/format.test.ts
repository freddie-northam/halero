// formatDateInZone assembles its result from formatToParts' labeled
// fields rather than a locale date string, so an exact YYYY-MM-DD match
// is safe here (unlike a locale-formatted string such as formatTime's
// output, which this suite never exact-matches).

import { describe, expect, test } from "bun:test";
import { formatDateInZone } from "./format";

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
