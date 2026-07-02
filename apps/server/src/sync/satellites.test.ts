import { describe, expect, test } from "bun:test";
import type { UpsertSyncOp } from "@halero/connector-sdk";
import { calendarEvents } from "@halero/db";
import { CALENDAR_EVENT_KIND } from "@halero/schemas";
import { eq } from "drizzle-orm";
import { makeTestApp, type TestApp } from "../test-utils";
import { type SatelliteWriter, satelliteWriterFor } from "./satellites";

const ENTITY_ID = "ent-1";

const withEntity = (): TestApp => {
  const testApp = makeTestApp();
  testApp.database.sqlite.run(
    `INSERT INTO entities (id, kind, schema_version, source, created_at, updated_at)
     VALUES (?, 'calendar.event', 1, 'connector', 1, 1)`,
    [ENTITY_ID],
  );
  return testApp;
};

const sourceEvent = {
  id: "evt-1",
  etag: '"e1-v1"',
  status: "confirmed",
  summary: "Standup",
  start: { dateTime: "2025-07-02T09:30:00+01:00" },
  end: { dateTime: "2025-07-02T09:45:00+01:00" },
  attendees: [{ email: "a@example.com" }],
};

const upsertOp = (overrides: Partial<UpsertSyncOp> = {}): UpsertSyncOp => ({
  op: "upsert",
  externalId: "evt-1",
  version: '"e1-v1"',
  spine: { kind: CALENDAR_EVENT_KIND, schemaVersion: 1, title: "Standup" },
  satellite: {
    calendarId: "primary",
    allDay: 0,
    startDate: null,
    endDate: null,
    location: null,
    status: "confirmed",
    recurringEventId: null,
    originalStartTime: null,
  },
  raw: sourceEvent,
  ...overrides,
});

const calendarWriter = (): SatelliteWriter => {
  const writer = satelliteWriterFor(CALENDAR_EVENT_KIND);
  if (writer === undefined) {
    throw new Error("expected a calendar.event satellite writer");
  }
  return writer;
};

const readSatellite = (testApp: TestApp) =>
  testApp.database.db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.entityId, ENTITY_ID))
    .get();

describe("calendar.event satellite writer", () => {
  test("stores the raw source event so it parses back verbatim", () => {
    const testApp = withEntity();

    calendarWriter()(testApp.database.db, ENTITY_ID, upsertOp());

    const row = readSatellite(testApp);
    expect(row?.calendarId).toBe("primary");
    expect(row?.status).toBe("confirmed");
    expect(JSON.parse(row?.raw ?? "null")).toEqual(sourceEvent);
  });

  test("stores a null raw column when the op carries no raw payload", () => {
    const testApp = withEntity();
    const { raw: _omitted, ...withoutRaw } = upsertOp();

    calendarWriter()(testApp.database.db, ENTITY_ID, withoutRaw);

    expect(readSatellite(testApp)?.raw).toBeNull();
  });

  test("replaces the whole row on a second write for the same entity", () => {
    const testApp = withEntity();
    const writer = calendarWriter();
    writer(testApp.database.db, ENTITY_ID, upsertOp());

    const moved = { ...sourceEvent, etag: '"e1-v2"' };
    writer(
      testApp.database.db,
      ENTITY_ID,
      upsertOp({
        satellite: {
          calendarId: "work",
          allDay: 1,
          startDate: "2025-07-01",
          endDate: "2025-07-02",
          location: "HQ",
          status: "tentative",
          recurringEventId: null,
          originalStartTime: null,
        },
        raw: moved,
      }),
    );

    const row = readSatellite(testApp);
    expect(row?.calendarId).toBe("work");
    expect(row?.allDay).toBe(1);
    expect(row?.location).toBe("HQ");
    expect(JSON.parse(row?.raw ?? "null")).toEqual(moved);
  });

  test("rejects a satellite in an unrecognized shape with a readable error", () => {
    const testApp = withEntity();
    const writer = calendarWriter();

    const wrongTypes = upsertOp({ satellite: { calendarId: 7, allDay: 0 } });
    const missing = upsertOp({ satellite: undefined });

    expect(() => writer(testApp.database.db, ENTITY_ID, wrongTypes)).toThrow(
      /shape Halero does not recognize/,
    );
    expect(() => writer(testApp.database.db, ENTITY_ID, missing)).toThrow(
      /connector bug/,
    );
    expect(readSatellite(testApp)).toBeUndefined();
  });
});

describe("satelliteWriterFor", () => {
  test("knows calendar.event and nothing else yet", () => {
    expect(satelliteWriterFor(CALENDAR_EVENT_KIND)).toBeDefined();
    expect(satelliteWriterFor("widget.gadget")).toBeUndefined();
  });
});
