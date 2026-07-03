import { describe, expect, test } from "bun:test";
import { formatMinutes } from "./format-minutes";

describe("formatMinutes", () => {
  test("zero minutes reads as 0m", () => {
    expect(formatMinutes(0)).toBe("0m");
  });

  test("under an hour shows minutes only", () => {
    expect(formatMinutes(45)).toBe("45m");
  });

  test("an exact hour has no leading zero minutes", () => {
    expect(formatMinutes(60)).toBe("1h");
  });

  test("hours and minutes both show", () => {
    expect(formatMinutes(170)).toBe("2h 50m");
  });

  test("a large duration formats past a single digit hour", () => {
    expect(formatMinutes(725)).toBe("12h 5m");
  });
});
