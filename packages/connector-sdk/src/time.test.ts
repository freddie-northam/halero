import { describe, expect, test } from "bun:test";
import {
  addDaysToDateString,
  dateStringInZone,
  dayBoundsInZone,
  instantInZone,
  startOfDayInZone,
} from "./time";

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

describe("startOfDayInZone when midnight falls in a spring-forward gap", () => {
  test("America/Santiago 2025-09-07 starts at 01:00 local", () => {
    // Chile springs forward at local midnight: 00:00-00:59 on Sep 7 do
    // not exist. The day starts at the first instant after the gap,
    // 01:00 local = 04:00Z, never an instant on the previous local day.
    const start = startOfDayInZone("2025-09-07", "America/Santiago");
    expect(start).toBe(Date.UTC(2025, 8, 7, 4, 0, 0));
    expect(dateStringInZone(start, "America/Santiago")).toBe("2025-09-07");
  });

  test("Atlantic/Azores 2025-03-30 starts at 01:00 local", () => {
    // The EU transition at 01:00 UTC is local midnight in the Azores
    // (UTC-1 in winter), so 00:00-00:59 local do not exist that day.
    const start = startOfDayInZone("2025-03-30", "Atlantic/Azores");
    expect(start).toBe(Date.UTC(2025, 2, 30, 1, 0, 0));
    expect(dateStringInZone(start, "Atlantic/Azores")).toBe("2025-03-30");
  });

  test("the gap day still spans 23 hours to the next midnight", () => {
    const bounds = dayBoundsInZone("2025-09-07", "America/Santiago");
    expect(bounds.start).toBe(Date.UTC(2025, 8, 7, 4, 0, 0));
    expect(bounds.end).toBe(Date.UTC(2025, 8, 8, 3, 0, 0));
    expect(bounds.end - bounds.start).toBe(23 * HOUR);
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

describe("instantInZone", () => {
  test("agrees with startOfDayInZone at 00:00 on an ordinary day", () => {
    expect(instantInZone("2025-06-15", "00:00", "Europe/London")).toBe(
      startOfDayInZone("2025-06-15", "Europe/London"),
    );
  });

  test("adds the wall-clock offset from midnight on an ordinary day", () => {
    const midnight = startOfDayInZone("2025-06-15", "Europe/London");
    expect(instantInZone("2025-06-15", "14:30", "Europe/London")).toBe(
      midnight + 14 * HOUR + 30 * 60_000,
    );
  });

  test("rejects a malformed time of day with a readable error", () => {
    for (const bad of ["1:30", "24:00", "12:60", "noon", "12:5"]) {
      expect(() => instantInZone("2025-06-15", bad, "UTC")).toThrow(
        /time of day.*HH:MM/i,
      );
    }
  });

  test("stays monotonic across a spring-forward gap, including gapped times", () => {
    // 2025-03-30 in Europe/London: clocks jump 01:00 GMT to 02:00 BST,
    // so 01:00-01:59 do not exist that day.
    const times = ["00:30", "01:15", "01:45", "02:15", "03:30"];
    const instants = times.map((time) =>
      instantInZone("2025-03-30", time, "Europe/London"),
    );
    for (let index = 1; index < instants.length; index += 1) {
      expect(instants[index]).toBeGreaterThanOrEqual(
        instants[index - 1] as number,
      );
    }
  });

  test("resolves a gapped wall time to a real instant on the correct date", () => {
    // 01:00-01:59 do not exist in London on 2025-03-30 (clocks jump
    // straight from 01:00 GMT to 02:00 BST), so a request for a wall
    // time inside the gap must still resolve to a real, later instant
    // whose own local reading is the correct side of the transition
    // (never one computed as if the gap had not happened).
    const gapped = instantInZone("2025-03-30", "01:30", "Europe/London");
    expect(dateStringInZone(gapped, "Europe/London")).toBe("2025-03-30");
    expect(gapped).toBeGreaterThan(
      instantInZone("2025-03-30", "00:30", "Europe/London"),
    );
    expect(gapped).toBeLessThan(
      instantInZone("2025-03-30", "03:30", "Europe/London"),
    );
  });
});
