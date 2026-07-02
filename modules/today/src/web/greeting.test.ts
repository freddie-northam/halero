import { describe, expect, test } from "bun:test";
import { greetingForHour, hourInZone } from "./greeting";

describe("greetingForHour", () => {
  test("greets the morning from 05:00", () => {
    expect(greetingForHour(5)).toBe("Good morning");
    expect(greetingForHour(8)).toBe("Good morning");
    expect(greetingForHour(11)).toBe("Good morning");
  });

  test("greets the afternoon from 12:00", () => {
    expect(greetingForHour(12)).toBe("Good afternoon");
    expect(greetingForHour(15)).toBe("Good afternoon");
    expect(greetingForHour(17)).toBe("Good afternoon");
  });

  test("greets the evening from 18:00 through the small hours", () => {
    expect(greetingForHour(18)).toBe("Good evening");
    expect(greetingForHour(23)).toBe("Good evening");
    expect(greetingForHour(0)).toBe("Good evening");
    expect(greetingForHour(4)).toBe("Good evening");
  });
});

describe("hourInZone", () => {
  // 2026-07-01T23:00Z: a moment where the hour differs across timezones.
  const instant = Date.UTC(2026, 6, 1, 23, 0, 0);

  test("reads the hour in the given timezone, not the runtime's", () => {
    expect(hourInZone(instant, "UTC")).toBe(23);
    // Tokyo (UTC+9) is already into the next morning.
    expect(hourInZone(instant, "Asia/Tokyo")).toBe(8);
    // Los Angeles (UTC-7 in July) is still in the afternoon.
    expect(hourInZone(instant, "America/Los_Angeles")).toBe(16);
  });

  test("uses a 0-23 clock so midnight stays hour zero", () => {
    const midnight = Date.UTC(2026, 6, 2, 0, 0, 0);
    expect(hourInZone(midnight, "UTC")).toBe(0);
  });

  test("composes with the greeting: home-tz hour decides the greeting", () => {
    expect(greetingForHour(hourInZone(instant, "Asia/Tokyo"))).toBe(
      "Good morning",
    );
    expect(greetingForHour(hourInZone(instant, "UTC"))).toBe("Good evening");
  });
});
