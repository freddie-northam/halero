import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UpsertSyncOp } from "@halero/connector-sdk";
import {
  calendarEvents,
  coreMigrations,
  type HaleroDatabase,
  openDatabase,
  runMigrations,
} from "@halero/db";
import { CALENDAR_EVENT_KIND } from "@halero/schemas";
import { eq } from "drizzle-orm";
import { calendarServerModule } from "./index";
import { writeCalendarEventSatellite } from "./satellite";

const ENTITY_ID = "ent-1";

const withEntity = (): HaleroDatabase => {
  const dir = mkdtempSync(join(tmpdir(), "halero-module-calendar-"));
  const database = openDatabase(join(dir, "halero.db"));
  runMigrations(database.sqlite, {
    migrations: coreMigrations,
    backupsDir: join(dir, "backups"),
  });
  database.sqlite.run(
    `INSERT INTO entities (id, kind, schema_version, source, created_at, updated_at)
     VALUES (?, 'calendar.event', 1, 'connector', 1, 1)`,
    [ENTITY_ID],
  );
  return database;
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
    notes: null,
    url: null,
  },
  raw: sourceEvent,
  ...overrides,
});

const readSatellite = (database: HaleroDatabase) =>
  database.db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.entityId, ENTITY_ID))
    .get();

describe("calendar.event satellite writer", () => {
  test("stores the raw source event so it parses back verbatim", () => {
    const database = withEntity();

    writeCalendarEventSatellite(database.db, ENTITY_ID, upsertOp());

    const row = readSatellite(database);
    expect(row?.calendarId).toBe("primary");
    expect(row?.status).toBe("confirmed");
    expect(JSON.parse(row?.raw ?? "null")).toEqual(sourceEvent);
  });

  test("stores a null raw column when the op carries no raw payload", () => {
    const database = withEntity();
    const { raw: _omitted, ...withoutRaw } = upsertOp();

    writeCalendarEventSatellite(database.db, ENTITY_ID, withoutRaw);

    expect(readSatellite(database)?.raw).toBeNull();
  });

  test("replaces the whole row on a second write for the same entity", () => {
    const database = withEntity();
    writeCalendarEventSatellite(database.db, ENTITY_ID, upsertOp());

    const moved = { ...sourceEvent, etag: '"e1-v2"' };
    writeCalendarEventSatellite(
      database.db,
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
          notes: "Bring the slide deck",
          url: "https://meet.example.com/room",
        },
        raw: moved,
      }),
    );

    const row = readSatellite(database);
    expect(row?.calendarId).toBe("work");
    expect(row?.allDay).toBe(1);
    expect(row?.location).toBe("HQ");
    expect(row?.notes).toBe("Bring the slide deck");
    expect(row?.url).toBe("https://meet.example.com/room");
    expect(JSON.parse(row?.raw ?? "null")).toEqual(moved);
  });

  test("rejects a satellite in an unrecognized shape with a readable error", () => {
    const database = withEntity();

    const wrongTypes = upsertOp({ satellite: { calendarId: 7, allDay: 0 } });
    const missing = upsertOp({ satellite: undefined });

    expect(() =>
      writeCalendarEventSatellite(database.db, ENTITY_ID, wrongTypes),
    ).toThrow(/shape Halero does not recognize/);
    expect(() =>
      writeCalendarEventSatellite(database.db, ENTITY_ID, missing),
    ).toThrow(/connector bug/);
    expect(readSatellite(database)).toBeUndefined();
  });
});

describe("calendarServerModule", () => {
  test("contributes calendar.event at version 1 with the satellite writer", () => {
    const contribution = calendarServerModule.entityKinds[0];
    if (contribution === undefined) {
      throw new Error("expected the calendar module to contribute a kind");
    }

    expect(calendarServerModule.id).toBe("calendar");
    expect(contribution.kind).toBe(CALENDAR_EVENT_KIND);
    expect(contribution.schemaVersion).toBe(1);
    expect(contribution.satelliteWriter).toBe(writeCalendarEventSatellite);
  });
});
