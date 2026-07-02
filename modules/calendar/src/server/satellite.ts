// The calendar.event satellite writer, moved from the host's hardcoded
// kind map. The engine resolves it through the module registry now.

import { calendarEvents } from "@halero/db";
import type { SatelliteWriter } from "@halero/module-sdk/server";
import { calendarEventSatelliteSchema } from "@halero/schemas";

const SATELLITE_SHAPE_MESSAGE =
  "The connector sent calendar event details in a shape Halero does not " +
  "recognize. This is a connector bug; syncing stopped.";

export const writeCalendarEventSatellite: SatelliteWriter = (
  db,
  entityId,
  op,
) => {
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
