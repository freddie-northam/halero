import { z } from "zod";

export const CALENDAR_EVENT_KIND = "calendar.event";

// TODO: flesh out fields (time range, attendees, source) in a later task.
export const calendarEventSchema = z.object({
  title: z.string(),
});

export type CalendarEvent = z.infer<typeof calendarEventSchema>;
