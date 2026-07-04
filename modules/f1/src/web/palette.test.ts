import { describe, expect, test } from "bun:test";
import { flagColour, formatLapTime, tyreColour } from "./palette";

describe("tyreColour", () => {
  test("maps known compounds case-insensitively", () => {
    expect(tyreColour("SOFT")).toBe("#DA291C");
    expect(tyreColour("medium")).toBe("#FFD12E");
    expect(tyreColour(" Hard ")).toBe("#EBEBEB");
  });

  test("falls back to neutral grey for null or unknown compounds", () => {
    expect(tyreColour(null)).toBe("#6b7280");
    expect(tyreColour("PLAID")).toBe("#6b7280");
  });
});

describe("flagColour", () => {
  test("maps race-control flags including double yellow and safety car", () => {
    expect(flagColour("GREEN")).toBe("#43B02A");
    expect(flagColour("double yellow")).toBe("#E8A500");
    expect(flagColour("SAFETY CAR")).toBe("#F97350");
    expect(flagColour("CHEQUERED")).toBe("#111111");
  });

  test("falls back to neutral grey for null or unknown flags", () => {
    expect(flagColour(null)).toBe("#6b7280");
    expect(flagColour("PURPLE")).toBe("#6b7280");
  });
});

describe("formatLapTime", () => {
  test("renders sub-minute times as seconds", () => {
    expect(formatLapTime(59.123)).toBe("59.123");
  });

  test("renders minute-plus times as m:ss.mmm", () => {
    expect(formatLapTime(83.456)).toBe("1:23.456");
    expect(formatLapTime(90)).toBe("1:30.000");
  });

  test("returns a dash for null or invalid durations", () => {
    expect(formatLapTime(null)).toBe("-");
    expect(formatLapTime(-1)).toBe("-");
  });
});
