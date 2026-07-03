import { describe, expect, test } from "bun:test";
import {
  addDaysToDate,
  eventTimeLabel,
  formatEventTime,
} from "./agenda-helpers";

describe("addDaysToDate", () => {
  test("adds within a month", () => {
    expect(addDaysToDate("2026-07-03", 1)).toBe("2026-07-04");
  });

  test("rolls over month and year boundaries", () => {
    expect(addDaysToDate("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDaysToDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  test("handles leap days", () => {
    expect(addDaysToDate("2024-02-28", 1)).toBe("2024-02-29");
  });

  test("subtracts with negative days", () => {
    expect(addDaysToDate("2026-07-01", -1)).toBe("2026-06-30");
  });
});

describe("formatEventTime", () => {
  const noonUtc = Date.UTC(2026, 6, 3, 12, 30);

  test("formats 24-hour wall-clock time in the given zone", () => {
    expect(formatEventTime(noonUtc, "UTC")).toBe("12:30");
    // London is on BST (+1) in July.
    expect(formatEventTime(noonUtc, "Europe/London")).toBe("13:30");
  });
});

describe("eventTimeLabel", () => {
  const start = Date.UTC(2026, 6, 3, 9, 0);
  const end = Date.UTC(2026, 6, 3, 10, 30);

  test("labels all-day events", () => {
    expect(eventTimeLabel({ allDay: true, start, end }, "UTC")).toBe("all day");
  });

  test("labels timed events with a start-end range", () => {
    expect(eventTimeLabel({ allDay: false, start, end }, "UTC")).toBe(
      "09:00 - 10:30",
    );
  });
});
