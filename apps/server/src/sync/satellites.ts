// Kind-specific satellite writers. The engine stays generic; this map is
// the one hardcoded seam that knows how each entity kind's satellite
// table is written. Task 9's module SDK replaces it with per-module
// registration.

import type { UpsertSyncOp } from "@halero/connector-sdk";
import { calendarEvents, type HaleroDatabase } from "@halero/db";
import { CALENDAR_EVENT_KIND } from "@halero/schemas";
import { z } from "zod";

type Db = HaleroDatabase["db"];

const SATELLITE_SHAPE_MESSAGE =
  "The connector sent calendar event details in a shape Halero does not " +
  "recognize. This is a connector bug; syncing stopped.";

const calendarEventSatelliteSchema = z.object({
  calendarId: z.string().min(1),
  allDay: z.union([z.literal(0), z.literal(1)]),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  location: z.string().nullable(),
  status: z.string().nullable(),
  recurringEventId: z.string().nullable(),
  originalStartTime: z.string().nullable(),
});

export type SatelliteWriter = (
  db: Db,
  entityId: string,
  op: UpsertSyncOp,
) => void;

const writeCalendarEventSatellite: SatelliteWriter = (db, entityId, op) => {
  const parsed = calendarEventSatelliteSchema.safeParse(op.satellite ?? {});
  if (!parsed.success) {
    throw new Error(SATELLITE_SHAPE_MESSAGE);
  }
  const values = {
    entityId,
    ...parsed.data,
    raw: op.raw === undefined ? null : JSON.stringify(op.raw),
  };
  db.insert(calendarEvents)
    .values(values)
    .onConflictDoUpdate({ target: calendarEvents.entityId, set: values })
    .run();
};

const satelliteWriters: Readonly<Record<string, SatelliteWriter>> = {
  [CALENDAR_EVENT_KIND]: writeCalendarEventSatellite,
};

export const satelliteWriterFor = (kind: string): SatelliteWriter | undefined =>
  satelliteWriters[kind];
