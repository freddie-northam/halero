import { describe, expect, test } from "bun:test";
import type { DriverStints, Stint } from "../../contract";
import { lapRange, stintBar } from "./stint-utils";

const stint = (over: Partial<Stint>): Stint => ({
  stintNumber: 1,
  lapStart: 1,
  lapEnd: 10,
  compound: "SOFT",
  tyreAgeAtStart: 0,
  ...over,
});

const driver = (stints: Stint[]): DriverStints => ({
  driverNumber: 1,
  nameAcronym: "VER",
  fullName: null,
  teamName: null,
  teamColour: null,
  stints,
});

describe("lapRange", () => {
  test("spans the widest lap window across drivers", () => {
    const range = lapRange([
      driver([stint({ lapStart: 1, lapEnd: 20 })]),
      driver([stint({ lapStart: 5, lapEnd: 40 })]),
    ]);
    expect(range).toEqual({ start: 1, end: 40 });
  });

  test("falls back to a unit range when there are no stints", () => {
    expect(lapRange([])).toEqual({ start: 1, end: 1 });
    expect(
      lapRange([driver([stint({ lapStart: null, lapEnd: null })])]),
    ).toEqual({ start: 1, end: 1 });
  });
});

describe("stintBar", () => {
  test("maps a stint to inclusive offset and width percentages", () => {
    const bar = stintBar(stint({ lapStart: 1, lapEnd: 10 }), {
      start: 1,
      end: 10,
    });
    expect(bar).toEqual({ offsetPct: 0, widthPct: 100 });
  });

  test("offsets a later stint within the range", () => {
    const bar = stintBar(stint({ lapStart: 11, lapEnd: 20 }), {
      start: 1,
      end: 20,
    });
    expect(bar?.offsetPct).toBeCloseTo(50, 5);
    expect(bar?.widthPct).toBeCloseTo(50, 5);
  });

  test("returns null for a stint with unknown bounds", () => {
    expect(
      stintBar(stint({ lapStart: null }), { start: 1, end: 10 }),
    ).toBeNull();
  });
});
