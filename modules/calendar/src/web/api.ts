// What the calendar page needs from the host: the module's own tRPC
// procedures, wired up by the app registry. Mirrors TasksApi.

import type {
  AgendaEvent,
  CalendarEventList,
  CalendarRange,
  CalendarToday,
  CalendarUpcoming,
} from "../contract";

export interface CalendarEventInput {
  readonly title: string;
  readonly allDay: boolean;
  /** "YYYY-MM-DD", the (start) day. */
  readonly date: string;
  /** All-day multi-day only, inclusive; omit for a single day. */
  readonly endDate?: string;
  /** "HH:MM" (24h), required when !allDay. */
  readonly startTime?: string;
  /** "HH:MM" (24h), required when !allDay. */
  readonly endTime?: string;
  readonly location?: string;
  readonly notes?: string;
  readonly url?: string;
}

export interface CalendarEventUpdateInput extends CalendarEventInput {
  readonly entityId: string;
}

export interface CalendarApi {
  readonly today: () => Promise<CalendarToday>;
  readonly range: (from: string, to: string) => Promise<CalendarRange>;
  readonly events: (from: string, to: string) => Promise<CalendarEventList>;
  /** The soonest future events for the context panel's "Next up" card. */
  readonly upcoming: (limit?: number) => Promise<CalendarUpcoming>;
  readonly createEvent: (input: CalendarEventInput) => Promise<AgendaEvent>;
  readonly updateEvent: (
    input: CalendarEventUpdateInput,
  ) => Promise<AgendaEvent>;
  readonly deleteEvent: (entityId: string) => Promise<{ entityId: string }>;
}
