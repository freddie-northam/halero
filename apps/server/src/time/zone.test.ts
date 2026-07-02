import { describe, expect, test } from "bun:test";
import {
  addDaysToDateString,
  dateStringInZone,
  dayBoundsInZone,
  startOfDayInZone,
} from "./zone";

const HOUR = 3_600_000;

describe("startOfDayInZone", () => {
  test("resolves midnight in a fixed-offset zone east of UTC", () => {
    // Pacific/Tongatapu sits at UTC+13 all year: local midnight on the
    // 15th is 11:00 UTC on the 14th.
    expect(startOfDayInZone("2025-06-15", "Pacific/Tongatapu")).toBe(
      Date.UTC(2025, 5, 14, 11, 0, 0),
    );
  });

  test("resolves midnight in UTC itself", () => {
    expect(startOfDayInZone("2025-06-15", "UTC")).toBe(
      Date.UTC(2025, 5, 15, 0, 0, 0),
    );
  });

  test("rejects a malformed date string with a readable error", () => {
    expect(() => startOfDayInZone("15/06/2025", "UTC")).toThrow(
      /date.*YYYY-MM-DD/i,
    );
  });
});

describe("dayBoundsInZone across DST transitions", () => {
  test("spring-forward day in Europe/London is 23 hours long", () => {
    // 2025-03-30: clocks jump 01:00 GMT to 02:00 BST. Midnight is still
    // GMT (UTC+0); the next midnight is BST (UTC+1).
    const bounds = dayBoundsInZone("2025-03-30", "Europe/London");
    expect(bounds.start).toBe(Date.UTC(2025, 2, 30, 0, 0, 0));
    expect(bounds.end).toBe(Date.UTC(2025, 2, 30, 23, 0, 0));
    expect(bounds.end - bounds.start).toBe(23 * HOUR);
  });

  test("fall-back day in Europe/London is 25 hours long", () => {
    // 2025-10-26: clocks fall back 02:00 BST to 01:00 GMT. Midnight is
    // BST (UTC+1); the next midnight is GMT (UTC+0).
    const bounds = dayBoundsInZone("2025-10-26", "Europe/London");
    expect(bounds.start).toBe(Date.UTC(2025, 9, 25, 23, 0, 0));
    expect(bounds.end).toBe(Date.UTC(2025, 9, 27, 0, 0, 0));
    expect(bounds.end - bounds.start).toBe(25 * HOUR);
  });

  test("an ordinary day is exactly 24 hours long", () => {
    const bounds = dayBoundsInZone("2025-06-15", "Europe/London");
    expect(bounds.end - bounds.start).toBe(24 * HOUR);
  });
});

describe("dateStringInZone", () => {
  test("maps an instant to the calendar date of its zone", () => {
    // 22:00 UTC on the 14th is already the 15th in Tongatapu (UTC+13)
    // and still the 14th in London (23:00 BST).
    const instant = Date.UTC(2025, 5, 14, 22, 0, 0);
    expect(dateStringInZone(instant, "Pacific/Tongatapu")).toBe("2025-06-15");
    expect(dateStringInZone(instant, "Europe/London")).toBe("2025-06-14");
  });

  test("keeps single-digit months and days zero-padded", () => {
    expect(dateStringInZone(Date.UTC(2025, 0, 5, 12, 0, 0), "UTC")).toBe(
      "2025-01-05",
    );
  });
});

describe("addDaysToDateString", () => {
  test("adds days across a month boundary", () => {
    expect(addDaysToDateString("2025-06-28", 7)).toBe("2025-07-05");
  });

  test("handles leap-year February", () => {
    expect(addDaysToDateString("2024-02-28", 1)).toBe("2024-02-29");
  });
});
