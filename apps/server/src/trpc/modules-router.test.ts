import { describe, expect, test } from "bun:test";
import { startOfDayInZone } from "@halero/connector-sdk";
import { calendarEvents, entities } from "@halero/db";
import {
  completeSetup,
  makeTestApp,
  sessionCookieFrom,
  type TestApp,
  type TrpcSuccess,
  trpcMutation,
  trpcQuery,
} from "../test-utils";

// The test clock (1_700_000_000_000) is 2023-11-14T22:13:20Z; London is on
// GMT in November, so "today" there is 2023-11-14.
const LONDON_TODAY_START = Date.UTC(2023, 10, 14, 0, 0, 0);

interface AgendaEventData {
  readonly entityId: string;
  readonly title: string;
  readonly allDay: boolean;
  readonly start: number;
  readonly end: number;
  readonly location: string | null;
  readonly calendarId: string;
  readonly recurring: boolean;
}

interface AgendaData {
  readonly homeTimezone: string;
  readonly days: readonly {
    readonly date: string;
    readonly events: readonly AgendaEventData[];
  }[];
}

interface SeedEventInput {
  readonly id: string;
  readonly title: string;
  readonly occurredStart: number;
  readonly occurredEnd: number;
  readonly allDay?: boolean;
  readonly location?: string;
  readonly deletedAt?: number;
  readonly recurringEventId?: string;
}

const seedEvent = (testApp: TestApp, input: SeedEventInput): void => {
  testApp.database.db
    .insert(entities)
    .values({
      id: input.id,
      kind: "calendar.event",
      schemaVersion: 1,
      title: input.title,
      snippet: null,
      occurredStart: input.occurredStart,
      occurredEnd: input.occurredEnd,
      source: "connector",
      createdAt: 1,
      updatedAt: 1,
      deletedAt: input.deletedAt ?? null,
    })
    .run();
  testApp.database.db
    .insert(calendarEvents)
    .values({
      entityId: input.id,
      calendarId: "primary",
      allDay: input.allDay === true ? 1 : 0,
      startDate: null,
      endDate: null,
      location: input.location ?? null,
      status: "confirmed",
      recurringEventId: input.recurringEventId ?? null,
    })
    .run();
};

const readAgenda = async (
  app: TestApp["app"],
  cookie: string,
  days?: number,
): Promise<AgendaData> => {
  const procedure =
    days === undefined
      ? "modules.calendar.agenda"
      : `modules.calendar.agenda?input=${encodeURIComponent(JSON.stringify({ days }))}`;
  const res = await trpcQuery(app, procedure, { cookie });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<AgendaData>;
  return json.result.data;
};

// The agenda moved into the calendar module; this suite pins the host
// mount contract: the module's router serves at modules.calendar.* with
// the host's auth and settings in effect.
describe("modules.calendar.agenda", () => {
  test("rejects without a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);

    const res = await trpcQuery(app, "modules.calendar.agenda");

    expect(res.status).toBe(401);
  });

  test("groups by home-timezone day with all-day events first", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    // Deliberately seeded out of order.
    seedEvent(testApp, {
      id: "ev-late",
      title: "Afternoon call",
      occurredStart: Date.UTC(2023, 10, 14, 15, 0, 0),
      occurredEnd: Date.UTC(2023, 10, 14, 15, 30, 0),
      location: "Zoom",
    });
    seedEvent(testApp, {
      id: "ev-allday",
      title: "Conference",
      occurredStart: LONDON_TODAY_START,
      occurredEnd: LONDON_TODAY_START + 86_400_000,
      allDay: true,
    });
    seedEvent(testApp, {
      id: "ev-early",
      title: "Standup",
      occurredStart: Date.UTC(2023, 10, 14, 9, 0, 0),
      occurredEnd: Date.UTC(2023, 10, 14, 9, 15, 0),
    });
    seedEvent(testApp, {
      id: "ev-thursday",
      title: "Review",
      occurredStart: Date.UTC(2023, 10, 16, 13, 0, 0),
      occurredEnd: Date.UTC(2023, 10, 16, 14, 0, 0),
    });

    const agenda = await readAgenda(testApp.app, cookie);

    expect(agenda.homeTimezone).toBe("Europe/London");
    expect(agenda.days.map((day) => day.date)).toEqual([
      "2023-11-14",
      "2023-11-16",
    ]);
    expect(agenda.days[0]?.events.map((event) => event.entityId)).toEqual([
      "ev-allday",
      "ev-early",
      "ev-late",
    ]);
    expect(agenda.days[0]?.events[0]?.allDay).toBe(true);
    expect(agenda.days[0]?.events[2]?.location).toBe("Zoom");
  });

  test("excludes events outside the window and tombstoned events", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedEvent(testApp, {
      id: "ev-yesterday",
      title: "Too old",
      occurredStart: LONDON_TODAY_START - 60_000,
      occurredEnd: LONDON_TODAY_START - 30_000,
    });
    seedEvent(testApp, {
      id: "ev-window-start",
      title: "At the stroke of midnight",
      occurredStart: LONDON_TODAY_START,
      occurredEnd: LONDON_TODAY_START + 60_000,
    });
    seedEvent(testApp, {
      id: "ev-window-end",
      title: "Exactly seven days out",
      occurredStart: LONDON_TODAY_START + 7 * 86_400_000,
      occurredEnd: LONDON_TODAY_START + 7 * 86_400_000 + 60_000,
    });
    seedEvent(testApp, {
      id: "ev-deleted",
      title: "Cancelled meeting",
      occurredStart: Date.UTC(2023, 10, 15, 9, 0, 0),
      occurredEnd: Date.UTC(2023, 10, 15, 10, 0, 0),
      deletedAt: 5,
    });

    const agenda = await readAgenda(testApp.app, cookie);

    const ids = agenda.days.flatMap((day) =>
      day.events.map((event) => event.entityId),
    );
    expect(ids).toEqual(["ev-window-start"]);
  });

  test("respects the days parameter", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedEvent(testApp, {
      id: "ev-today",
      title: "Today",
      occurredStart: Date.UTC(2023, 10, 14, 9, 0, 0),
      occurredEnd: Date.UTC(2023, 10, 14, 10, 0, 0),
    });
    seedEvent(testApp, {
      id: "ev-tomorrow",
      title: "Tomorrow",
      occurredStart: Date.UTC(2023, 10, 15, 9, 0, 0),
      occurredEnd: Date.UTC(2023, 10, 15, 10, 0, 0),
    });

    const agenda = await readAgenda(testApp.app, cookie, 1);

    const ids = agenda.days.flatMap((day) =>
      day.events.map((event) => event.entityId),
    );
    expect(ids).toEqual(["ev-today"]);
  });

  test("computes the window in the home timezone, not UTC", async () => {
    const testApp = makeTestApp();
    // Tongatapu is UTC+13: at the test clock's 2023-11-14T22:13:20Z it is
    // already 11:13 on the 15th there.
    const setupRes = await trpcMutation(testApp.app, "system.setup", {
      password: "correct horse battery",
      homeTimezone: "Pacific/Tongatapu",
    });
    const cookie = sessionCookieFrom(setupRes);
    seedEvent(testApp, {
      id: "ev-local-morning",
      title: "Already the 15th locally",
      occurredStart: Date.UTC(2023, 10, 14, 12, 0, 0),
      occurredEnd: Date.UTC(2023, 10, 14, 12, 30, 0),
    });
    seedEvent(testApp, {
      id: "ev-local-yesterday",
      title: "Still the 14th locally",
      occurredStart: Date.UTC(2023, 10, 14, 10, 0, 0),
      occurredEnd: Date.UTC(2023, 10, 14, 10, 30, 0),
    });

    const agenda = await readAgenda(testApp.app, cookie);

    expect(agenda.homeTimezone).toBe("Pacific/Tongatapu");
    expect(agenda.days).toHaveLength(1);
    expect(agenda.days[0]?.date).toBe("2023-11-15");
    expect(agenda.days[0]?.events.map((event) => event.entityId)).toEqual([
      "ev-local-morning",
    ]);
  });

  test("groups an all-day event under its own date when midnight falls in a DST gap", async () => {
    const testApp = makeTestApp();
    // Chile springs forward at local midnight into 2025-09-07; midnight
    // does not exist that day. The event's occurredStart comes from the
    // same helper the sync mapping uses, so a start-of-day instant that
    // leaked onto Sep 6 would group it under the wrong header.
    testApp.clock.value = Date.UTC(2025, 8, 6, 12, 0, 0);
    const setupRes = await trpcMutation(testApp.app, "system.setup", {
      password: "correct horse battery",
      homeTimezone: "America/Santiago",
    });
    const cookie = sessionCookieFrom(setupRes);
    seedEvent(testApp, {
      id: "ev-gap-allday",
      title: "Election day",
      occurredStart: startOfDayInZone("2025-09-07", "America/Santiago"),
      occurredEnd: startOfDayInZone("2025-09-08", "America/Santiago"),
      allDay: true,
    });

    const agenda = await readAgenda(testApp.app, cookie);

    expect(agenda.days.map((day) => day.date)).toEqual(["2025-09-07"]);
    expect(agenda.days[0]?.events[0]?.entityId).toBe("ev-gap-allday");
  });
});

interface TrpcErrorBody {
  readonly error: { readonly message: string };
}

const rangeRes = (
  app: TestApp["app"],
  cookie: string,
  from: string,
  to: string,
): Promise<Response> =>
  trpcQuery(
    app,
    `modules.calendar.range?input=${encodeURIComponent(JSON.stringify({ from, to }))}`,
    { cookie },
  );

const readRange = async (
  app: TestApp["app"],
  cookie: string,
  from: string,
  to: string,
): Promise<AgendaData> => {
  const res = await rangeRes(app, cookie, from, to);
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<AgendaData>;
  return json.result.data;
};

const rangeErrorMessage = async (
  app: TestApp["app"],
  cookie: string,
  from: string,
  to: string,
): Promise<string> => {
  const res = await rangeRes(app, cookie, from, to);
  expect(res.status).toBe(400);
  const json = (await res.json()) as TrpcErrorBody;
  return json.error.message;
};

describe("modules.calendar.range", () => {
  test("rejects without a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);

    const res = await rangeRes(app, "", "2023-11-14", "2023-11-16");

    expect(res.status).toBe(401);
  });

  test("includes the window start and excludes the exclusive end", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedEvent(testApp, {
      id: "ev-at-start",
      title: "At the stroke of midnight",
      occurredStart: LONDON_TODAY_START,
      occurredEnd: LONDON_TODAY_START + 60_000,
    });
    seedEvent(testApp, {
      id: "ev-at-end",
      title: "First minute past the window",
      occurredStart: Date.UTC(2023, 10, 16, 0, 0, 0),
      occurredEnd: Date.UTC(2023, 10, 16, 0, 30, 0),
    });
    // Ends exactly when the window opens; [start, end) never intersects.
    seedEvent(testApp, {
      id: "ev-ends-at-start",
      title: "Over before the window",
      occurredStart: Date.UTC(2023, 10, 13, 22, 0, 0),
      occurredEnd: LONDON_TODAY_START,
    });
    seedEvent(testApp, {
      id: "ev-deleted",
      title: "Cancelled",
      occurredStart: Date.UTC(2023, 10, 14, 9, 0, 0),
      occurredEnd: Date.UTC(2023, 10, 14, 10, 0, 0),
      deletedAt: 5,
    });

    const range = await readRange(
      testApp.app,
      cookie,
      "2023-11-14",
      "2023-11-16",
    );

    expect(range.homeTimezone).toBe("Europe/London");
    const ids = range.days.flatMap((day) =>
      day.events.map((event) => event.entityId),
    );
    expect(ids).toEqual(["ev-at-start"]);
  });

  test("clamps an event that started before the window to the window's days", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    // Runs 2023-11-12 through midday on the 15th; the window only sees
    // the 14th and 15th of it.
    seedEvent(testApp, {
      id: "ev-spanning",
      title: "Long offsite",
      occurredStart: Date.UTC(2023, 10, 12, 10, 0, 0),
      occurredEnd: Date.UTC(2023, 10, 15, 12, 0, 0),
    });

    const range = await readRange(
      testApp.app,
      cookie,
      "2023-11-14",
      "2023-11-16",
    );

    expect(range.days.map((day) => day.date)).toEqual([
      "2023-11-14",
      "2023-11-15",
    ]);
    for (const day of range.days) {
      expect(day.events.map((event) => event.entityId)).toEqual([
        "ev-spanning",
      ]);
    }
  });

  test("spans a 2-day all-day event across exactly 2 day groups", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedEvent(testApp, {
      id: "ev-two-day",
      title: "Workshop",
      occurredStart: startOfDayInZone("2023-11-15", "Europe/London"),
      occurredEnd: startOfDayInZone("2023-11-17", "Europe/London"),
      allDay: true,
    });
    seedEvent(testApp, {
      id: "ev-timed-16th",
      title: "Debrief",
      occurredStart: Date.UTC(2023, 10, 16, 9, 0, 0),
      occurredEnd: Date.UTC(2023, 10, 16, 10, 0, 0),
    });

    const range = await readRange(
      testApp.app,
      cookie,
      "2023-11-13",
      "2023-11-20",
    );

    expect(range.days.map((day) => day.date)).toEqual([
      "2023-11-15",
      "2023-11-16",
    ]);
    // The all-day event leads the timed one on its second day too.
    expect(range.days[1]?.events.map((event) => event.entityId)).toEqual([
      "ev-two-day",
      "ev-timed-16th",
    ]);
  });

  test("groups a month-boundary window across both months", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedEvent(testApp, {
      id: "ev-october",
      title: "Halloween",
      occurredStart: Date.UTC(2023, 9, 31, 18, 0, 0),
      occurredEnd: Date.UTC(2023, 9, 31, 20, 0, 0),
    });
    seedEvent(testApp, {
      id: "ev-december",
      title: "Advent kickoff",
      occurredStart: Date.UTC(2023, 11, 3, 9, 0, 0),
      occurredEnd: Date.UTC(2023, 11, 3, 10, 0, 0),
    });
    seedEvent(testApp, {
      id: "ev-past-window",
      title: "Excluded",
      occurredStart: Date.UTC(2023, 11, 4, 9, 0, 0),
      occurredEnd: Date.UTC(2023, 11, 4, 10, 0, 0),
    });

    const range = await readRange(
      testApp.app,
      cookie,
      "2023-10-30",
      "2023-12-04",
    );

    expect(range.days.map((day) => day.date)).toEqual([
      "2023-10-31",
      "2023-12-03",
    ]);
  });

  test("keeps day boundaries across the London clocks-back week", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    // London leaves BST on 2023-10-29: the day is 25 hours long and its
    // local midnight is 2023-10-28T23:00Z.
    seedEvent(testApp, {
      id: "ev-week-start",
      title: "Just after Monday midnight BST",
      occurredStart: Date.UTC(2023, 9, 22, 23, 30, 0),
      occurredEnd: Date.UTC(2023, 9, 23, 0, 0, 0),
    });
    seedEvent(testApp, {
      id: "ev-before-fallback",
      title: "00:30 BST on the long day",
      occurredStart: Date.UTC(2023, 9, 28, 23, 30, 0),
      occurredEnd: Date.UTC(2023, 9, 29, 0, 0, 0),
    });
    seedEvent(testApp, {
      id: "ev-after-fallback",
      title: "01:30 GMT on the long day",
      occurredStart: Date.UTC(2023, 9, 29, 1, 30, 0),
      occurredEnd: Date.UTC(2023, 9, 29, 2, 0, 0),
    });
    seedEvent(testApp, {
      id: "ev-long-day",
      title: "All of the 25-hour day",
      occurredStart: startOfDayInZone("2023-10-29", "Europe/London"),
      occurredEnd: startOfDayInZone("2023-10-30", "Europe/London"),
      allDay: true,
    });

    const range = await readRange(
      testApp.app,
      cookie,
      "2023-10-23",
      "2023-10-30",
    );

    expect(range.days.map((day) => day.date)).toEqual([
      "2023-10-23",
      "2023-10-29",
    ]);
    // The 25-hour all-day event stays on its single day, ahead of the
    // timed events on both sides of the transition.
    expect(range.days[1]?.events.map((event) => event.entityId)).toEqual([
      "ev-long-day",
      "ev-before-fallback",
      "ev-after-fallback",
    ]);
  });

  test("groups a spring-forward gap day under its own date", async () => {
    const testApp = makeTestApp();
    // Chile springs forward at local midnight into 2025-09-07, so that
    // day has no 00:00; the range must still file it under 2025-09-07.
    const setupRes = await trpcMutation(testApp.app, "system.setup", {
      password: "correct horse battery",
      homeTimezone: "America/Santiago",
    });
    const cookie = sessionCookieFrom(setupRes);
    seedEvent(testApp, {
      id: "ev-gap-allday",
      title: "Election day",
      occurredStart: startOfDayInZone("2025-09-07", "America/Santiago"),
      occurredEnd: startOfDayInZone("2025-09-08", "America/Santiago"),
      allDay: true,
    });

    const range = await readRange(
      testApp.app,
      cookie,
      "2025-09-01",
      "2025-09-08",
    );

    expect(range.days.map((day) => day.date)).toEqual(["2025-09-07"]);
  });

  test("flags instances of recurring events", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedEvent(testApp, {
      id: "ev-recurring",
      title: "Weekly sync",
      occurredStart: Date.UTC(2023, 10, 14, 9, 0, 0),
      occurredEnd: Date.UTC(2023, 10, 14, 9, 30, 0),
      recurringEventId: "master-123",
    });
    seedEvent(testApp, {
      id: "ev-one-off",
      title: "One-off",
      occurredStart: Date.UTC(2023, 10, 14, 10, 0, 0),
      occurredEnd: Date.UTC(2023, 10, 14, 10, 30, 0),
    });

    const range = await readRange(
      testApp.app,
      cookie,
      "2023-11-14",
      "2023-11-15",
    );

    const byId = new Map(
      range.days
        .flatMap((day) => day.events)
        .map((event) => [event.entityId, event.recurring]),
    );
    expect(byId.get("ev-recurring")).toBe(true);
    expect(byId.get("ev-one-off")).toBe(false);
  });

  test("accepts a 62-day window and rejects 63 days readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const range = await readRange(
      testApp.app,
      cookie,
      "2023-01-01",
      "2023-03-04",
    );
    expect(range.days).toEqual([]);

    const message = await rangeErrorMessage(
      testApp.app,
      cookie,
      "2023-01-01",
      "2023-03-05",
    );
    expect(message).toBe("Calendar ranges are limited to 62 days at a time.");
  });

  test("rejects malformed dates readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    expect(
      await rangeErrorMessage(testApp.app, cookie, "14/11/2023", "2023-11-16"),
    ).toBe('"14/11/2023" is not a calendar date; expected YYYY-MM-DD.');
    expect(
      await rangeErrorMessage(testApp.app, cookie, "2023-11-14", "2023-02-31"),
    ).toBe('"2023-02-31" is not a calendar date; expected YYYY-MM-DD.');
  });

  test("rejects an inverted or empty window readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const inverted = await rangeErrorMessage(
      testApp.app,
      cookie,
      "2023-11-16",
      "2023-11-14",
    );
    const empty = await rangeErrorMessage(
      testApp.app,
      cookie,
      "2023-11-14",
      "2023-11-14",
    );
    expect(inverted).toBe(
      "The range start date must come before its end date.",
    );
    expect(empty).toBe("The range start date must come before its end date.");
  });
});

describe("modules.calendar.today", () => {
  test("rejects without a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);

    const res = await trpcQuery(app, "modules.calendar.today");

    expect(res.status).toBe(401);
  });

  test("returns today's date in the home timezone", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const res = await trpcQuery(testApp.app, "modules.calendar.today", {
      cookie,
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as TrpcSuccess<{
      homeTimezone: string;
      today: string;
    }>;
    expect(json.result.data).toEqual({
      homeTimezone: "Europe/London",
      today: "2023-11-14",
    });
  });

  test("crosses the date line with the home timezone, not UTC", async () => {
    const testApp = makeTestApp();
    // At the test clock's 2023-11-14T22:13:20Z it is already the 15th in
    // Tongatapu (UTC+13).
    const setupRes = await trpcMutation(testApp.app, "system.setup", {
      password: "correct horse battery",
      homeTimezone: "Pacific/Tongatapu",
    });
    const cookie = sessionCookieFrom(setupRes);

    const res = await trpcQuery(testApp.app, "modules.calendar.today", {
      cookie,
    });

    const json = (await res.json()) as TrpcSuccess<{
      homeTimezone: string;
      today: string;
    }>;
    expect(json.result.data.today).toBe("2023-11-15");
  });
});
