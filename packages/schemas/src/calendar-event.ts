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
