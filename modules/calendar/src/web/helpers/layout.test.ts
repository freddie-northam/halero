import { describe, expect, test } from "bun:test";
import { packEventLanes } from "./layout";

describe("packEventLanes", () => {
  test("returns an empty array for no events", () => {
    expect(packEventLanes([])).toEqual([]);
  });

  test("non-overlapping events (including touching end-to-start) all get lane 0", () => {
    const events = [
      { start: 0, end: 60 },
      { start: 60, end: 120 }, // touches the first; not an overlap
      { start: 200, end: 260 }, // a clean gap
    ];

    expect(packEventLanes(events)).toEqual([
      { lane: 0, laneCount: 1 },
      { lane: 0, laneCount: 1 },
      { lane: 0, laneCount: 1 },
    ]);
  });

  test("two overlapping events land in distinct lanes with laneCount 2", () => {
    const events = [
      { start: 0, end: 60 },
      { start: 30, end: 90 },
    ];

    expect(packEventLanes(events)).toEqual([
      { lane: 0, laneCount: 2 },
      { lane: 1, laneCount: 2 },
    ]);
  });

  test("preserves input order even when it differs from start order", () => {
    const events = [
      { start: 30, end: 90 }, // starts later, listed first
      { start: 0, end: 60 },
    ];

    expect(packEventLanes(events)).toEqual([
      { lane: 1, laneCount: 2 },
      { lane: 0, laneCount: 2 },
    ]);
  });

  test("a chain (A overlaps B, B overlaps C, A and C do not) reuses a freed lane", () => {
    const a = { start: 0, end: 10 };
    const b = { start: 5, end: 15 };
    const c = { start: 10, end: 20 }; // touches A's end, overlaps B

    expect(packEventLanes([a, b, c])).toEqual([
      { lane: 0, laneCount: 2 },
      { lane: 1, laneCount: 2 },
      { lane: 0, laneCount: 2 },
    ]);
  });

  test("a nested event inside a longer one shares a lane with a later sibling", () => {
    const outer = { start: 0, end: 100 };
    const first = { start: 10, end: 20 };
    const second = { start: 30, end: 40 }; // does not overlap `first`

    expect(packEventLanes([outer, first, second])).toEqual([
      { lane: 0, laneCount: 2 },
      { lane: 1, laneCount: 2 },
      { lane: 1, laneCount: 2 },
    ]);
  });

  test("separate overlap clusters are packed independently", () => {
    const events = [
      { start: 0, end: 60 },
      { start: 30, end: 90 }, // overlaps the first cluster
      { start: 200, end: 260 },
      { start: 220, end: 280 }, // overlaps the second cluster
    ];

    expect(packEventLanes(events)).toEqual([
      { lane: 0, laneCount: 2 },
      { lane: 1, laneCount: 2 },
      { lane: 0, laneCount: 2 },
      { lane: 1, laneCount: 2 },
    ]);
  });
});
