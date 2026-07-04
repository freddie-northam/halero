import { describe, expect, test } from "bun:test";
import type { HeatmapDay } from "../../contract";
import { colorLevel, weeksFromDays } from "./heatmap-layout";

describe("colorLevel", () => {
  test("maps no contributions to the empty band", () => {
    expect(colorLevel(0, 10)).toBe(0);
    expect(colorLevel(-3, 10)).toBe(0);
  });

  test("returns the empty band when the window has no contributions", () => {
    expect(colorLevel(0, 0)).toBe(0);
    expect(colorLevel(5, 0)).toBe(0);
  });

  test("splits the range into quartile bands 1..4", () => {
    expect(colorLevel(1, 100)).toBe(1);
    expect(colorLevel(25, 100)).toBe(1);
    expect(colorLevel(26, 100)).toBe(2);
    expect(colorLevel(50, 100)).toBe(2);
    expect(colorLevel(75, 100)).toBe(3);
    expect(colorLevel(76, 100)).toBe(4);
    expect(colorLevel(100, 100)).toBe(4);
  });
});

const day = (date: string, count = 0): HeatmapDay => ({ date, count });

describe("weeksFromDays", () => {
  test("returns no columns for an empty list", () => {
    expect(weeksFromDays([])).toEqual([]);
  });

  test("pads the first partial week at the top with nulls", () => {
    // 2026-07-01 is a Wednesday (weekday 3), so Sun..Tue are padded.
    const weeks = weeksFromDays([day("2026-07-01", 4)]);
    expect(weeks).toHaveLength(1);
    const first = weeks[0];
    expect(first).toEqual([
      null,
      null,
      null,
      day("2026-07-01", 4),
      null,
      null,
      null,
    ]);
  });

  test("buckets a full week into one aligned column", () => {
    // 2026-07-05 is a Sunday: seven days fill exactly one column.
    const days = [
      day("2026-07-05"),
      day("2026-07-06"),
      day("2026-07-07"),
      day("2026-07-08"),
      day("2026-07-09"),
      day("2026-07-10"),
      day("2026-07-11"),
    ];
    const weeks = weeksFromDays(days);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toEqual(days);
  });

  test("spans multiple weeks and pads the last partial week at the bottom", () => {
    // Sunday 2026-07-05 through Monday 2026-07-13: 9 days across 2 columns.
    const days = Array.from({ length: 9 }, (_, index) =>
      day(`2026-07-${String(5 + index).padStart(2, "0")}`),
    );
    const weeks = weeksFromDays(days);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toHaveLength(7);
    const second = weeks[1];
    expect(second).toHaveLength(7);
    expect(second?.slice(2)).toEqual([null, null, null, null, null]);
  });
});
