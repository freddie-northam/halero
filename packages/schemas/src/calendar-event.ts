import { z } from "zod";

export const CALENDAR_EVENT_KIND = "calendar.event";

/**
 * Display fallback for calendar events without a summary. Lives with the
 * kind contract because both connectors (mapping) and hosts (rendering)
 * need to agree on it.
 */
export const UNTITLED_EVENT_TITLE = "(untitled event)";

// TODO: flesh out fields (time range, attendees, source) in a later task.
export const calendarEventSchema = z.object({
  title: z.string(),
});

export type CalendarEvent = z.infer<typeof calendarEventSchema>;

/**
 * The calendar.event satellite payload at schema version 1: the shape a
 * connector's upsert op must carry and the calendar module's satellite
 * writer stores. Lives with the kind contract because connectors
 * (producing) and the module (storing) must agree on it.
 */
export const calendarEventSatelliteSchema = z.object({
  calendarId: z.string().min(1),
  allDay: z.union([z.literal(0), z.literal(1)]),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  location: z.string().nullable(),
  status: z.string().nullable(),
  recurringEventId: z.string().nullable(),
  originalStartTime: z.string().nullable(),
});

export type CalendarEventSatellite = z.infer<
  typeof calendarEventSatelliteSchema
>;
