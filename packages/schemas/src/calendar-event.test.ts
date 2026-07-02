import { describe, expect, test } from "bun:test";
import { CALENDAR_EVENT_KIND, calendarEventSchema } from "./calendar-event";

describe("calendarEventSchema", () => {
  test("parses a valid calendar event", () => {
    const result = calendarEventSchema.parse({ title: "Team standup" });

    expect(result).toEqual({ title: "Team standup" });
  });

  test("rejects an event missing a title", () => {
    expect(() => calendarEventSchema.parse({})).toThrow();
  });
});

test("CALENDAR_EVENT_KIND identifies the calendar event kind", () => {
  expect(CALENDAR_EVENT_KIND).toBe("calendar.event");
});
