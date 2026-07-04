import { describe, expect, test } from "bun:test";
import { asBool, asGap, asNumber, asString } from "./openf1-client";

describe("asNumber", () => {
  test("passes finite numbers through", () => {
    expect(asNumber(0)).toBe(0);
    expect(asNumber(9472)).toBe(9472);
    expect(asNumber(26.0)).toBe(26);
  });

  test("parses string-encoded numbers (e.g. expires_in)", () => {
    expect(asNumber("3600")).toBe(3600);
  });

  test("returns null for non-numbers, blanks, and NaN/Infinity", () => {
    expect(asNumber(null)).toBeNull();
    expect(asNumber(undefined)).toBeNull();
    expect(asNumber("")).toBeNull();
    expect(asNumber("nope")).toBeNull();
    expect(asNumber(Number.NaN)).toBeNull();
    expect(asNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("asString / asBool", () => {
  test("asString keeps strings, nulls everything else", () => {
    expect(asString("VER")).toBe("VER");
    expect(asString(1)).toBeNull();
    expect(asString(null)).toBeNull();
  });

  test("asBool is true only for a real boolean true", () => {
    expect(asBool(true)).toBe(true);
    expect(asBool(false)).toBe(false);
    expect(asBool("true")).toBe(false);
    expect(asBool(1)).toBe(false);
    expect(asBool(null)).toBe(false);
  });
});

describe("asGap (polymorphic gap_to_leader)", () => {
  test("formats a numeric gap with a leading plus", () => {
    expect(asGap(0)).toBe("+0.000");
    expect(asGap(22.457)).toBe("+22.457");
  });

  test("keeps a lapped-car string as-is", () => {
    expect(asGap("+1 LAP")).toBe("+1 LAP");
    expect(asGap("+2 LAPS")).toBe("+2 LAPS");
  });

  test("returns null for a DNF's null gap", () => {
    expect(asGap(null)).toBeNull();
    expect(asGap(undefined)).toBeNull();
  });
});
