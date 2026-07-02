import { describe, expect, test } from "bun:test";
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
import { startOfDayInZone } from "../time/zone";

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
      ? "calendar.agenda"
      : `calendar.agenda?input=${encodeURIComponent(JSON.stringify({ days }))}`;
  const res = await trpcQuery(app, procedure, { cookie });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<AgendaData>;
  return json.result.data;
};

describe("calendar.agenda", () => {
  test("rejects without a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);

    const res = await trpcQuery(app, "calendar.agenda");

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
