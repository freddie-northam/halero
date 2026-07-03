import { describe, expect, test } from "bun:test";
import { CALENDAR_EVENT_KIND } from "@halero/schemas";
import type { CalendarApi } from "./api";
import { createCalendarWebModule } from "./index";

const stubApi: CalendarApi = {
  today: () => Promise.resolve({ homeTimezone: "UTC", today: "2023-11-14" }),
  range: () => Promise.resolve({ homeTimezone: "UTC", days: [] }),
  events: () => Promise.resolve({ homeTimezone: "UTC", events: [] }),
  upcoming: () => Promise.resolve({ homeTimezone: "UTC", events: [] }),
  createEvent: () => Promise.reject(new Error("not under test")),
  updateEvent: () => Promise.reject(new Error("not under test")),
  deleteEvent: () => Promise.reject(new Error("not under test")),
};

describe("the calendar module's entity link", () => {
  const link = createCalendarWebModule(stubApi).entityLinks?.[0];

  test("claims the calendar event kind under the Event heading", () => {
    expect(link?.kind).toBe(CALENDAR_EVENT_KIND);
    expect(link?.label).toBe("Event");
  });

  test("sends a dated hit to the agenda anchored on its date", () => {
    expect(
      link?.buildLink({ entityId: "ev-1", occurredDate: "2023-11-14" }),
    ).toEqual({
      path: "/calendar",
      search: { view: "agenda", date: "2023-11-14" },
    });
  });

  test("omits the date param for a hit without an occurred date", () => {
    expect(link?.buildLink({ entityId: "ev-1", occurredDate: null })).toEqual({
      path: "/calendar",
      search: { view: "agenda" },
    });
  });
});
