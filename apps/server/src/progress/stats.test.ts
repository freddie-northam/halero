import { describe, expect, test } from "bun:test";
import { type ActivityDay, computeStats } from "./stats";

const day = (date: string, count: number): ActivityDay => ({ date, count });

describe("computeStats", () => {
  test("empty series yields all zeros", () => {
    expect(computeStats([], "2026-07-03")).toEqual({
      total: 0,
      currentStreak: 0,
      longestStreak: 0,
    });
  });

  test("all-zero series has no total and no streaks", () => {
    const days = [day("2026-07-01", 0), day("2026-07-02", 0)];
    expect(computeStats(days, "2026-07-03")).toEqual({
      total: 0,
      currentStreak: 0,
      longestStreak: 0,
    });
  });

  test("single active day counts once", () => {
    const days = [day("2026-07-03", 5)];
    expect(computeStats(days, "2026-07-03")).toEqual({
      total: 5,
      currentStreak: 1,
      longestStreak: 1,
    });
  });

  test("longest run is broken by a gap in the dates", () => {
    const days = [
      day("2026-06-01", 1),
      day("2026-06-02", 3),
      // 2026-06-03 is absent (treated as 0), breaking the run.
      day("2026-06-04", 2),
      day("2026-06-05", 1),
      day("2026-06-06", 4),
    ];
    expect(computeStats(days, "2026-07-03").longestStreak).toBe(3);
  });

  test("longest run is broken by a zero day in a densified series", () => {
    const days = [
      day("2026-06-01", 1),
      day("2026-06-02", 1),
      day("2026-06-03", 0),
      day("2026-06-04", 1),
    ];
    expect(computeStats(days, "2026-07-03").longestStreak).toBe(2);
  });

  test("current streak ends on today when today is active", () => {
    const days = [
      day("2026-07-01", 2),
      day("2026-07-02", 1),
      day("2026-07-03", 3),
    ];
    expect(computeStats(days, "2026-07-03").currentStreak).toBe(3);
  });

  test("current streak continues from yesterday when today is still 0", () => {
    const days = [
      day("2026-07-01", 2),
      day("2026-07-02", 1),
      day("2026-07-03", 0),
    ];
    expect(computeStats(days, "2026-07-03").currentStreak).toBe(2);
  });

  test("current streak is 0 when today and yesterday are both 0", () => {
    const days = [
      day("2026-07-01", 5),
      day("2026-07-02", 0),
      day("2026-07-03", 0),
    ];
    expect(computeStats(days, "2026-07-03").currentStreak).toBe(0);
  });
});
