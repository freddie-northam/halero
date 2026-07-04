import { describe, expect, test } from "bun:test";
import type { LapPoint } from "../../contract";
import { fastestLap, filterRacingLaps, isOutlierLap } from "./lap-utils";

const lap = (over: Partial<LapPoint>): LapPoint => ({
  lapNumber: 1,
  lapDuration: 90,
  durationSector1: null,
  durationSector2: null,
  durationSector3: null,
  i1Speed: null,
  i2Speed: null,
  stSpeed: null,
  isPitOutLap: false,
  dateStart: null,
  ...over,
});

describe("fastestLap", () => {
  test("returns the minimum timed lap", () => {
    expect(
      fastestLap([lap({ lapDuration: 92 }), lap({ lapDuration: 89.5 })]),
    ).toBe(89.5);
  });

  test("ignores null and non-finite durations", () => {
    expect(
      fastestLap([lap({ lapDuration: null }), lap({ lapDuration: 91 })]),
    ).toBe(91);
    expect(fastestLap([lap({ lapDuration: null })])).toBeNull();
    expect(fastestLap([])).toBeNull();
  });
});

describe("isOutlierLap", () => {
  test("drops laps with no time or a pit-out flag", () => {
    expect(isOutlierLap(lap({ lapDuration: null }), 90)).toBe(true);
    expect(isOutlierLap(lap({ isPitOutLap: true }), 90)).toBe(true);
  });

  test("drops laps far slower than the fastest", () => {
    expect(isOutlierLap(lap({ lapDuration: 120 }), 90)).toBe(true);
    expect(isOutlierLap(lap({ lapDuration: 91 }), 90)).toBe(false);
  });

  test("keeps every timed lap when there is no fastest reference", () => {
    expect(isOutlierLap(lap({ lapDuration: 200 }), null)).toBe(false);
  });
});

describe("filterRacingLaps", () => {
  test("keeps only representative racing laps", () => {
    const laps = [
      lap({ lapNumber: 1, isPitOutLap: true, lapDuration: 95 }),
      lap({ lapNumber: 2, lapDuration: 90 }),
      lap({ lapNumber: 3, lapDuration: 91 }),
      lap({ lapNumber: 4, lapDuration: 130 }),
      lap({ lapNumber: 5, lapDuration: null }),
    ];
    expect(filterRacingLaps(laps).map((l) => l.lapNumber)).toEqual([2, 3]);
  });
});
