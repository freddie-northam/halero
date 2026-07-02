import { describe, expect, test } from "bun:test";
import {
  CALENDAR_EVENT_KIND,
  type CalendarEventSatellite,
  calendarEventSatelliteSchema,
  UNTITLED_EVENT_TITLE,
} from "./calendar-event";

describe("calendarEventSatelliteSchema", () => {
  const satellite: CalendarEventSatellite = {
    calendarId: "primary",
    allDay: 0,
    startDate: null,
    endDate: null,
    location: "Room 2",
    status: "confirmed",
    recurringEventId: null,
    originalStartTime: null,
  };

  test("parses a valid satellite payload", () => {
    expect(calendarEventSatelliteSchema.parse(satellite)).toEqual(satellite);
  });

  test("parses an all-day payload with date bounds", () => {
    const allDay: CalendarEventSatellite = {
      ...satellite,
      allDay: 1,
      startDate: "2025-07-01",
      endDate: "2025-07-02",
    };

    expect(calendarEventSatelliteSchema.parse(allDay)).toEqual(allDay);
  });

  test("rejects a payload without a calendar id", () => {
    const { calendarId: _dropped, ...rest } = satellite;

    expect(calendarEventSatelliteSchema.safeParse(rest).success).toBe(false);
  });

  test("rejects an allDay flag outside 0 and 1", () => {
    const parsed = calendarEventSatelliteSchema.safeParse({
      ...satellite,
      allDay: true,
    });

    expect(parsed.success).toBe(false);
  });
});

test("CALENDAR_EVENT_KIND identifies the calendar event kind", () => {
  expect(CALENDAR_EVENT_KIND).toBe("calendar.event");
});

test("UNTITLED_EVENT_TITLE is the shared display fallback", () => {
  expect(UNTITLED_EVENT_TITLE).toBe("(untitled event)");
});
