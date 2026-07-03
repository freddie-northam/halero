// The calendar module's server entry: its manifest, the calendar.event
// kind contribution, and the agenda router. The host wires all of it in
// through its module registry; nothing here imports host code.

import { defineServerModule } from "@halero/module-sdk/server";
import {
  CALENDAR_EVENT_KIND,
  calendarEventSatelliteSchema,
} from "@halero/schemas";
import { CALENDAR_EVENT_SCHEMA_VERSION, calendarRouter } from "./router";
import { writeCalendarEventSatellite } from "./satellite";

export { CALENDAR_EVENT_SCHEMA_VERSION } from "./router";

export const calendarServerModule = defineServerModule({
  id: "calendar",
  version: "0.1.0",
  entityKinds: [
    {
      kind: CALENDAR_EVENT_KIND,
      schemaVersion: CALENDAR_EVENT_SCHEMA_VERSION,
      schema: calendarEventSatelliteSchema,
      satelliteWriter: writeCalendarEventSatellite,
    },
  ],
  router: calendarRouter,
});

export type {
  Agenda,
  AgendaDay,
  AgendaEvent,
  CalendarEventList,
  CalendarRange,
  CalendarToday,
} from "../contract";
