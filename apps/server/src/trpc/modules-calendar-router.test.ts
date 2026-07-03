import { describe, expect, test } from "bun:test";
import { instantInZone, startOfDayInZone } from "@halero/connector-sdk";
import { createEntityStore, searchEntities } from "@halero/core";
import { calendarEvents, entities } from "@halero/db";
import { eq } from "drizzle-orm";
import {
  completeSetup,
  makeTestApp,
  type TestApp,
  type TrpcSuccess,
  trpcMutation,
  trpcQuery,
} from "../test-utils";

// The test clock (1_700_000_000_000) is 2023-11-14T22:13:20Z; London is
// on GMT in November, so "today" there is 2023-11-14.
const HOME_TZ = "Europe/London";

interface EventData {
  readonly entityId: string;
  readonly title: string;
  readonly allDay: boolean;
  readonly start: number;
  readonly end: number;
  readonly location: string | null;
  readonly calendarId: string;
  readonly recurring: boolean;
  readonly notes: string | null;
  readonly url: string | null;
  readonly editable: boolean;
}

interface CalendarEventListData {
  readonly homeTimezone: string;
  readonly events: readonly EventData[];
}

interface TrpcErrorBody {
  readonly error: { readonly message: string };
}

interface EventInput {
  readonly title: string;
  readonly allDay: boolean;
  readonly date: string;
  readonly endDate?: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly location?: string;
  readonly notes?: string;
  readonly url?: string;
}

const createEvent = async (
  app: TestApp["app"],
  cookie: string,
  input: EventInput,
): Promise<EventData> => {
  const res = await trpcMutation(app, "modules.calendar.createEvent", input, {
    cookie,
  });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<EventData>;
  return json.result.data;
};

const updateEvent = async (
  app: TestApp["app"],
  cookie: string,
  input: EventInput & { readonly entityId: string },
): Promise<EventData> => {
  const res = await trpcMutation(app, "modules.calendar.updateEvent", input, {
    cookie,
  });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<EventData>;
  return json.result.data;
};

const deleteEvent = async (
  app: TestApp["app"],
  cookie: string,
  entityId: string,
): Promise<void> => {
  const res = await trpcMutation(
    app,
    "modules.calendar.deleteEvent",
    { entityId },
    { cookie },
  );
  expect(res.status).toBe(200);
};

const listEvents = async (
  app: TestApp["app"],
  cookie: string,
  from: string,
  to: string,
): Promise<CalendarEventListData> => {
  const procedure = `modules.calendar.events?input=${encodeURIComponent(JSON.stringify({ from, to }))}`;
  const res = await trpcQuery(app, procedure, { cookie });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<CalendarEventListData>;
  return json.result.data;
};

const readUpcoming = async (
  app: TestApp["app"],
  cookie: string,
  limit?: number,
): Promise<CalendarEventListData> => {
  const procedure =
    limit === undefined
      ? "modules.calendar.upcoming"
      : `modules.calendar.upcoming?input=${encodeURIComponent(JSON.stringify({ limit }))}`;
  const res = await trpcQuery(app, procedure, { cookie });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<CalendarEventListData>;
  return json.result.data;
};

const mutationError = async (
  app: TestApp["app"],
  cookie: string,
  procedure: string,
  input: unknown,
  status: number,
): Promise<string> => {
  const res = await trpcMutation(app, procedure, input, { cookie });
  expect(res.status).toBe(status);
  const json = (await res.json()) as TrpcErrorBody;
  return json.error.message;
};

const readEntityRow = (testApp: TestApp, entityId: string) =>
  testApp.database.db
    .select()
    .from(entities)
    .where(eq(entities.id, entityId))
    .get();

const readSatelliteRow = (testApp: TestApp, entityId: string) =>
  testApp.database.db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.entityId, entityId))
    .get();

/** A live connector-owned event row: the store must refuse to touch it. */
const seedConnectorEvent = (testApp: TestApp, id: string): void => {
  testApp.database.db
    .insert(entities)
    .values({
      id,
      kind: "calendar.event",
      schemaVersion: 1,
      title: "Synced event",
      snippet: null,
      occurredStart: null,
      occurredEnd: null,
      source: "connector",
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    })
    .run();
  testApp.database.db
    .insert(calendarEvents)
    .values({
      entityId: id,
      calendarId: "primary",
      allDay: 0,
      startDate: null,
      endDate: null,
      location: null,
      status: "confirmed",
      recurringEventId: null,
      originalStartTime: null,
      notes: null,
      url: null,
    })
    .run();
};

/** A live connector-owned event with a real occurredStart/End, notes, and
 * a url, for asserting `upcoming` maps a synced (Google) row correctly. */
const seedFutureConnectorEvent = (
  testApp: TestApp,
  id: string,
  occurredStart: number,
  occurredEnd: number,
): void => {
  testApp.database.db
    .insert(entities)
    .values({
      id,
      kind: "calendar.event",
      schemaVersion: 1,
      title: "Team sync",
      snippet: null,
      occurredStart,
      occurredEnd,
      source: "connector",
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    })
    .run();
  testApp.database.db
    .insert(calendarEvents)
    .values({
      entityId: id,
      calendarId: "primary",
      allDay: 0,
      startDate: null,
      endDate: null,
      location: "HQ",
      status: "confirmed",
      recurringEventId: null,
      originalStartTime: null,
      notes: "agenda notes",
      url: "https://meet.example.com/sync",
    })
    .run();
};

const NOT_AN_EVENT_MESSAGE = "This item is not a calendar event.";
const EVENT_DELETED_MESSAGE = "This event was deleted.";
const CONNECTOR_MANAGED_MESSAGE =
  "This item is managed by a connector sync and cannot be edited.";

describe("modules.calendar create/update/delete/events auth", () => {
  test("every procedure rejects without a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);

    const query = await trpcQuery(
      app,
      `modules.calendar.events?input=${encodeURIComponent(JSON.stringify({ from: "2023-11-01", to: "2023-11-02" }))}`,
    );
    expect(query.status).toBe(401);
    const upcomingQuery = await trpcQuery(app, "modules.calendar.upcoming");
    expect(upcomingQuery.status).toBe(401);

    const mutations: readonly (readonly [string, unknown])[] = [
      [
        "modules.calendar.createEvent",
        { title: "Sneak in", allDay: true, date: "2023-11-20" },
      ],
      [
        "modules.calendar.updateEvent",
        { entityId: "e1", title: "Sneak in", allDay: true, date: "2023-11-20" },
      ],
      ["modules.calendar.deleteEvent", { entityId: "e1" }],
    ];
    for (const [procedure, input] of mutations) {
      const res = await trpcMutation(app, procedure, input);
      expect(res.status).toBe(401);
    }
  });
});

describe("modules.calendar.createEvent", () => {
  test("creates an all-day single-day event, editable and home-tz anchored", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const event = await createEvent(testApp.app, cookie, {
      title: "  Team offsite  ",
      allDay: true,
      date: "2023-11-20",
    });

    expect(event.title).toBe("Team offsite");
    expect(event.allDay).toBe(true);
    expect(event.editable).toBe(true);
    expect(event.start).toBe(startOfDayInZone("2023-11-20", HOME_TZ));
    expect(event.end).toBe(startOfDayInZone("2023-11-21", HOME_TZ));
    const satellite = readSatelliteRow(testApp, event.entityId);
    expect(satellite?.calendarId).toBe("halero-local");
    expect(satellite?.allDay).toBe(1);
    expect(satellite?.startDate).toBe("2023-11-20");
    expect(satellite?.endDate).toBe("2023-11-21");
    const entity = readEntityRow(testApp, event.entityId);
    expect(entity?.source).toBe("user");
  });

  test("stores a multi-day all-day event with an exclusive end date", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const event = await createEvent(testApp.app, cookie, {
      title: "Conference",
      allDay: true,
      date: "2023-11-20",
      endDate: "2023-11-22",
    });

    expect(event.start).toBe(startOfDayInZone("2023-11-20", HOME_TZ));
    expect(event.end).toBe(startOfDayInZone("2023-11-23", HOME_TZ));
    const satellite = readSatelliteRow(testApp, event.entityId);
    expect(satellite?.startDate).toBe("2023-11-20");
    expect(satellite?.endDate).toBe("2023-11-23");
  });

  test("anchors a timed event via instantInZone in the home timezone", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    testApp.clock.value = Date.UTC(2023, 10, 14, 8, 0, 0);

    const event = await createEvent(testApp.app, cookie, {
      title: "Standup",
      allDay: false,
      date: "2023-11-20",
      startTime: "09:30",
      endTime: "09:45",
      location: "Room 2",
    });

    expect(event.allDay).toBe(false);
    expect(event.location).toBe("Room 2");
    expect(event.start).toBe(instantInZone("2023-11-20", "09:30", HOME_TZ));
    expect(event.end).toBe(instantInZone("2023-11-20", "09:45", HOME_TZ));
    const satellite = readSatelliteRow(testApp, event.entityId);
    expect(satellite?.allDay).toBe(0);
    expect(satellite?.startDate).toBeNull();
    expect(satellite?.endDate).toBeNull();
  });

  test("stores notes and url and returns them", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const event = await createEvent(testApp.app, cookie, {
      title: "Retro",
      allDay: true,
      date: "2023-11-20",
      notes: "bring the burndown chart",
      url: "https://meet.example.com/retro",
    });

    expect(event.notes).toBe("bring the burndown chart");
    expect(event.url).toBe("https://meet.example.com/retro");
    const satellite = readSatelliteRow(testApp, event.entityId);
    expect(satellite?.notes).toBe("bring the burndown chart");
    expect(satellite?.url).toBe("https://meet.example.com/retro");
  });

  test("mirrors notes into the search snippet", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const event = await createEvent(testApp.app, cookie, {
      title: "Budget review",
      allDay: true,
      date: "2023-11-20",
      notes: "quarterly numbers",
    });

    const hits = searchEntities(testApp.database.sqlite, {
      query: "quarterly",
    });
    expect(hits.map((hit) => hit.entityId)).toContain(event.entityId);
  });

  test("stores no search snippet without notes", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const event = await createEvent(testApp.app, cookie, {
      title: "No notes here",
      allDay: true,
      date: "2023-11-20",
    });

    const entity = readEntityRow(testApp, event.entityId);
    expect(entity?.snippet).toBeNull();
  });

  test("appears in agenda, range, and the flat events feed", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const event = await createEvent(testApp.app, cookie, {
      title: "Standup",
      allDay: false,
      date: "2023-11-14",
      startTime: "09:30",
      endTime: "09:45",
    });

    const agendaRes = await trpcQuery(testApp.app, "modules.calendar.agenda", {
      cookie,
    });
    expect(agendaRes.status).toBe(200);
    const agenda = (
      (await agendaRes.json()) as TrpcSuccess<{
        readonly days: readonly {
          readonly events: readonly EventData[];
        }[];
      }>
    ).result.data;
    expect(
      agenda.days.flatMap((day) => day.events.map((e) => e.entityId)),
    ).toContain(event.entityId);

    const rangeInput = { from: "2023-11-14", to: "2023-11-15" };
    const rangeRes = await trpcQuery(
      testApp.app,
      `modules.calendar.range?input=${encodeURIComponent(JSON.stringify(rangeInput))}`,
      { cookie },
    );
    expect(rangeRes.status).toBe(200);
    const range = (
      (await rangeRes.json()) as TrpcSuccess<{
        readonly days: readonly {
          readonly events: readonly EventData[];
        }[];
      }>
    ).result.data;
    expect(
      range.days.flatMap((day) => day.events.map((e) => e.entityId)),
    ).toContain(event.entityId);

    const list = await listEvents(
      testApp.app,
      cookie,
      "2023-11-14",
      "2023-11-15",
    );
    expect(list.events.map((e) => e.entityId)).toEqual([event.entityId]);
  });
});

describe("modules.calendar.createEvent validation", () => {
  test("rejects a blank title readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.calendar.createEvent",
      { title: "   ", allDay: true, date: "2023-11-20" },
      400,
    );

    expect(message).toBe("An event needs a title.");
  });

  test("rejects an impossible date readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.calendar.createEvent",
      { title: "Leap of faith", allDay: true, date: "2026-02-31" },
      400,
    );

    expect(message).toBe(
      '"2026-02-31" is not a calendar date; expected YYYY-MM-DD.',
    );
  });

  test("rejects an end date before the start date readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.calendar.createEvent",
      {
        title: "Backwards",
        allDay: true,
        date: "2023-11-20",
        endDate: "2023-11-10",
      },
      400,
    );

    expect(message).toBe(
      "An event's end date cannot be before its start date.",
    );
  });

  test("rejects a timed event missing times readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.calendar.createEvent",
      { title: "No times", allDay: false, date: "2023-11-20" },
      400,
    );

    expect(message).toBe("A timed event needs a start and end time.");
  });

  test("rejects an end time at or before the start time readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    for (const endTime of ["09:00", "08:45"]) {
      const message = await mutationError(
        testApp.app,
        cookie,
        "modules.calendar.createEvent",
        {
          title: "Backwards times",
          allDay: false,
          date: "2023-11-20",
          startTime: "09:00",
          endTime,
        },
        400,
      );
      expect(message).toBe("An event's end time must be after its start time.");
    }
  });

  test("rejects a malformed time of day readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.calendar.createEvent",
      {
        title: "Bad time",
        allDay: false,
        date: "2023-11-20",
        startTime: "9:00",
        endTime: "09:30",
      },
      400,
    );

    expect(message).toBe('"9:00" is not a time of day; expected HH:MM (24h).');
  });
});

describe("modules.calendar.updateEvent", () => {
  test("full replace flips a timed event to all-day and drops omitted fields", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const created = await createEvent(testApp.app, cookie, {
      title: "Standup",
      allDay: false,
      date: "2023-11-20",
      startTime: "09:00",
      endTime: "09:15",
      location: "Room 1",
      notes: "old notes",
    });

    const updated = await updateEvent(testApp.app, cookie, {
      entityId: created.entityId,
      title: "Standup (moved)",
      allDay: true,
      date: "2023-11-21",
    });

    expect(updated.allDay).toBe(true);
    expect(updated.title).toBe("Standup (moved)");
    expect(updated.start).toBe(startOfDayInZone("2023-11-21", HOME_TZ));
    expect(updated.end).toBe(startOfDayInZone("2023-11-22", HOME_TZ));
    // Full replace: fields the second submission omitted are cleared,
    // not preserved from the prior write.
    expect(updated.location).toBeNull();
    expect(updated.notes).toBeNull();
    const satellite = readSatelliteRow(testApp, created.entityId);
    expect(satellite?.allDay).toBe(1);
    expect(satellite?.startDate).toBe("2023-11-21");
    expect(satellite?.location).toBeNull();
    expect(satellite?.notes).toBeNull();
  });

  test("recomputes the search snippet when notes change", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const created = await createEvent(testApp.app, cookie, {
      title: "Retag me",
      allDay: true,
      date: "2023-11-20",
      notes: "old topic",
    });

    await updateEvent(testApp.app, cookie, {
      entityId: created.entityId,
      title: "Retag me",
      allDay: true,
      date: "2023-11-20",
      notes: "new topic",
    });

    const oldHits = searchEntities(testApp.database.sqlite, {
      query: "old",
    });
    expect(oldHits.map((hit) => hit.entityId)).not.toContain(created.entityId);
    const newHits = searchEntities(testApp.database.sqlite, {
      query: "new",
    });
    expect(newHits.map((hit) => hit.entityId)).toContain(created.entityId);
  });

  test("rejects updateEvent and deleteEvent on a connector-managed entity as forbidden", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedConnectorEvent(testApp, "synced-event-1");

    const updateMessage = await mutationError(
      testApp.app,
      cookie,
      "modules.calendar.updateEvent",
      {
        entityId: "synced-event-1",
        title: "Mine now",
        allDay: true,
        date: "2023-11-20",
      },
      403,
    );
    expect(updateMessage).toBe(CONNECTOR_MANAGED_MESSAGE);

    const deleteMessage = await mutationError(
      testApp.app,
      cookie,
      "modules.calendar.deleteEvent",
      { entityId: "synced-event-1" },
      403,
    );
    expect(deleteMessage).toBe(CONNECTOR_MANAGED_MESSAGE);
  });

  test("rejects updateEvent on a tombstoned event as not found", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const created = await createEvent(testApp.app, cookie, {
      title: "Gone",
      allDay: true,
      date: "2023-11-20",
    });
    await deleteEvent(testApp.app, cookie, created.entityId);

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.calendar.updateEvent",
      {
        entityId: created.entityId,
        title: "Necromancy",
        allDay: true,
        date: "2023-11-20",
      },
      404,
    );

    expect(message).toBe(EVENT_DELETED_MESSAGE);
  });

  test("rejects update and delete on a non-event entity as not found", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const store = createEntityStore(testApp.database);
    const { entityId } = store.createUserEntity({
      kind: "task.item",
      schemaVersion: 1,
      title: "Not an event",
    });

    const updateMessage = await mutationError(
      testApp.app,
      cookie,
      "modules.calendar.updateEvent",
      { entityId, title: "Hijack", allDay: true, date: "2023-11-20" },
      404,
    );
    expect(updateMessage).toBe(NOT_AN_EVENT_MESSAGE);

    const deleteMessage = await mutationError(
      testApp.app,
      cookie,
      "modules.calendar.deleteEvent",
      { entityId },
      404,
    );
    expect(deleteMessage).toBe(NOT_AN_EVENT_MESSAGE);
  });
});

describe("modules.calendar.deleteEvent", () => {
  test("soft-deletes: the spine survives, the satellite stays, event drops out of the feed and search", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const created = await createEvent(testApp.app, cookie, {
      title: "Zanzibar trip",
      allDay: true,
      date: "2023-11-01",
    });
    const hitsBefore = searchEntities(testApp.database.sqlite, {
      query: "Zanzibar",
    });
    expect(hitsBefore.map((hit) => hit.entityId)).toContain(created.entityId);

    await deleteEvent(testApp.app, cookie, created.entityId);

    const entity = readEntityRow(testApp, created.entityId);
    expect(entity?.deletedAt).not.toBeNull();
    expect(readSatelliteRow(testApp, created.entityId)).toBeDefined();
    const list = await listEvents(
      testApp.app,
      cookie,
      "2023-10-30",
      "2023-11-05",
    );
    expect(list.events.map((e) => e.entityId)).not.toContain(created.entityId);
    expect(
      searchEntities(testApp.database.sqlite, { query: "Zanzibar" }),
    ).toHaveLength(0);
  });

  test("a repeat delete is an idempotent no-op", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const created = await createEvent(testApp.app, cookie, {
      title: "Twice",
      allDay: true,
      date: "2023-11-20",
    });
    await deleteEvent(testApp.app, cookie, created.entityId);
    const deletedAt = readEntityRow(testApp, created.entityId)?.deletedAt;
    expect(deletedAt).not.toBeNull();

    await deleteEvent(testApp.app, cookie, created.entityId);

    expect(readEntityRow(testApp, created.entityId)?.deletedAt).toBe(
      deletedAt ?? Number.NaN,
    );
  });
});

describe("modules.calendar.events", () => {
  test("returns one row per event, sorted, even for a multi-day span", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const multiDay = await createEvent(testApp.app, cookie, {
      title: "Conference",
      allDay: true,
      date: "2023-11-14",
      endDate: "2023-11-16",
    });
    const timed = await createEvent(testApp.app, cookie, {
      title: "Standup",
      allDay: false,
      date: "2023-11-15",
      startTime: "09:00",
      endTime: "09:15",
    });

    const list = await listEvents(
      testApp.app,
      cookie,
      "2023-11-14",
      "2023-11-17",
    );

    expect(list.homeTimezone).toBe(HOME_TZ);
    expect(list.events.map((e) => e.entityId)).toEqual([
      multiDay.entityId,
      timed.entityId,
    ]);
    expect(
      list.events.filter((e) => e.entityId === multiDay.entityId),
    ).toHaveLength(1);
  });

  test("rejects an invalid range readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const res = await trpcQuery(
      testApp.app,
      `modules.calendar.events?input=${encodeURIComponent(JSON.stringify({ from: "2023-11-20", to: "2023-11-01" }))}`,
      { cookie },
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as TrpcErrorBody;
    expect(json.error.message).toBe(
      "The range start date must come before its end date.",
    );
  });
});

describe("modules.calendar.upcoming", () => {
  // The test clock is 2023-11-14T22:13:20Z; every "future" fixture below
  // starts well after that.
  test("returns the soonest future event first, ascending", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const later = await createEvent(testApp.app, cookie, {
      title: "Later",
      allDay: false,
      date: "2023-11-17",
      startTime: "09:00",
      endTime: "09:30",
    });
    const sooner = await createEvent(testApp.app, cookie, {
      title: "Sooner",
      allDay: false,
      date: "2023-11-16",
      startTime: "09:00",
      endTime: "09:30",
    });

    const upcoming = await readUpcoming(testApp.app, cookie, 5);

    expect(upcoming.homeTimezone).toBe(HOME_TZ);
    expect(upcoming.events.map((e) => e.entityId)).toEqual([
      sooner.entityId,
      later.entityId,
    ]);
  });

  test("excludes events that already started", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    await createEvent(testApp.app, cookie, {
      title: "Past",
      allDay: false,
      date: "2023-11-14",
      startTime: "09:00",
      endTime: "09:30",
    });
    const future = await createEvent(testApp.app, cookie, {
      title: "Future",
      allDay: false,
      date: "2023-11-20",
      startTime: "09:00",
      endTime: "09:30",
    });

    const upcoming = await readUpcoming(testApp.app, cookie);

    expect(upcoming.events.map((e) => e.entityId)).toEqual([future.entityId]);
  });

  test("excludes a deleted event", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const created = await createEvent(testApp.app, cookie, {
      title: "Cancelled",
      allDay: false,
      date: "2023-11-20",
      startTime: "09:00",
      endTime: "09:30",
    });
    await deleteEvent(testApp.app, cookie, created.entityId);

    const upcoming = await readUpcoming(testApp.app, cookie);

    expect(upcoming.events).toEqual([]);
  });

  test("respects the limit input", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    for (const date of ["2023-11-16", "2023-11-17", "2023-11-18"]) {
      await createEvent(testApp.app, cookie, {
        title: `Event ${date}`,
        allDay: false,
        date,
        startTime: "09:00",
        endTime: "09:30",
      });
    }

    const upcoming = await readUpcoming(testApp.app, cookie, 2);

    expect(upcoming.events).toHaveLength(2);
  });

  test("defaults to a limit of 1", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    await createEvent(testApp.app, cookie, {
      title: "First",
      allDay: false,
      date: "2023-11-16",
      startTime: "09:00",
      endTime: "09:30",
    });
    await createEvent(testApp.app, cookie, {
      title: "Second",
      allDay: false,
      date: "2023-11-17",
      startTime: "09:00",
      endTime: "09:30",
    });

    const upcoming = await readUpcoming(testApp.app, cookie);

    expect(upcoming.events).toHaveLength(1);
  });

  test("includes a connector (Google) event as non-editable, with its notes and url", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedFutureConnectorEvent(
      testApp,
      "synced-upcoming",
      Date.UTC(2023, 10, 20, 9, 0, 0),
      Date.UTC(2023, 10, 20, 9, 30, 0),
    );

    const upcoming = await readUpcoming(testApp.app, cookie);

    expect(upcoming.events).toHaveLength(1);
    const [synced] = upcoming.events;
    expect(synced?.entityId).toBe("synced-upcoming");
    expect(synced?.editable).toBe(false);
    expect(synced?.location).toBe("HQ");
    expect(synced?.notes).toBe("agenda notes");
    expect(synced?.url).toBe("https://meet.example.com/sync");
  });
});
