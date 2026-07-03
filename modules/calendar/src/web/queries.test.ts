import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type { AgendaEvent } from "../contract";
import type { CalendarApi } from "./api";
import { withCalendarInvalidation } from "./queries";

const event: AgendaEvent = {
  entityId: "ev-1",
  title: "Standup",
  allDay: false,
  start: 0,
  end: 0,
  location: null,
  calendarId: "halero-local",
  recurring: false,
  notes: null,
  url: null,
  editable: true,
};

const makeStub = () => {
  const calls: string[] = [];
  const api: CalendarApi = {
    today: () => {
      calls.push("today");
      return Promise.resolve({ homeTimezone: "UTC", today: "2025-07-02" });
    },
    range: () => {
      calls.push("range");
      return Promise.resolve({ homeTimezone: "UTC", days: [] });
    },
    events: () => {
      calls.push("events");
      return Promise.resolve({ homeTimezone: "UTC", events: [event] });
    },
    upcoming: () => {
      calls.push("upcoming");
      return Promise.resolve({ homeTimezone: "UTC", events: [event] });
    },
    createEvent: () => {
      calls.push("createEvent");
      return Promise.resolve(event);
    },
    updateEvent: () => {
      calls.push("updateEvent");
      return Promise.resolve(event);
    },
    deleteEvent: () => {
      calls.push("deleteEvent");
      return Promise.resolve({ entityId: event.entityId });
    },
  };
  return { api, calls };
};

const makeSpyClient = () => {
  const queryClient = new QueryClient();
  let invalidations = 0;
  const original = queryClient.invalidateQueries.bind(queryClient);
  queryClient.invalidateQueries = ((...args: []) => {
    invalidations += 1;
    return original(...args);
  }) as QueryClient["invalidateQueries"];
  return { queryClient, invalidated: () => invalidations };
};

describe("withCalendarInvalidation", () => {
  test("invalidates the calendar queries after each mutation", async () => {
    const { api } = makeStub();
    const { queryClient, invalidated } = makeSpyClient();
    const wrapped = withCalendarInvalidation(api, queryClient);

    await wrapped.createEvent({
      title: "Standup",
      allDay: true,
      date: "2025-07-02",
    });
    expect(invalidated()).toBe(1);
    await wrapped.updateEvent({
      entityId: "ev-1",
      title: "Standup",
      allDay: true,
      date: "2025-07-02",
    });
    expect(invalidated()).toBe(2);
    await wrapped.deleteEvent("ev-1");
    expect(invalidated()).toBe(3);
  });

  test("passes reads through without touching the cache", async () => {
    const { api, calls } = makeStub();
    const { queryClient, invalidated } = makeSpyClient();
    const wrapped = withCalendarInvalidation(api, queryClient);

    await wrapped.today();
    await wrapped.range("2025-07-01", "2025-07-08");
    await wrapped.events("2025-07-01", "2025-07-08");
    await wrapped.upcoming(1);
    expect(calls).toEqual(["today", "range", "events", "upcoming"]);
    expect(invalidated()).toBe(0);
  });

  test("returns the underlying results and skips invalidation on failure", async () => {
    const { queryClient, invalidated } = makeSpyClient();
    const failing: CalendarApi = {
      ...makeStub().api,
      createEvent: () => Promise.reject(new Error("An event needs a title.")),
    };
    const wrapped = withCalendarInvalidation(failing, queryClient);

    expect(
      wrapped.createEvent({ title: "", allDay: true, date: "2025-07-02" }),
    ).rejects.toThrow("An event needs a title.");
    const deleted = await wrapped.deleteEvent("ev-1");
    expect(deleted.entityId).toBe("ev-1");
    expect(invalidated()).toBe(1);
  });
});
