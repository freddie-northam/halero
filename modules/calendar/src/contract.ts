// The calendar module's own API contract: the agenda shape its server
// router returns and its web page consumes. Pure types so both the
// server entry and the web entry can import them without dragging the
// other side's dependencies along.

export interface AgendaEvent {
  readonly entityId: string;
  readonly title: string;
  readonly allDay: boolean;
  /** Epoch ms; for all-day events these are home-timezone midnights. */
  readonly start: number;
  readonly end: number;
  readonly location: string | null;
  readonly calendarId: string;
  /** True for instances expanded from a recurring event. */
  readonly recurring: boolean;
}

export interface AgendaDay {
  readonly date: string;
  readonly events: readonly AgendaEvent[];
}

export interface Agenda {
  readonly homeTimezone: string;
  readonly days: readonly AgendaDay[];
}

/**
 * Day-grouped events for an explicit half-open [from, to) date window.
 * Unlike the agenda, an event appears under EVERY home-timezone day its
 * [start, end) window intersects, so multi-day events span correctly.
 */
export interface CalendarRange {
  readonly homeTimezone: string;
  readonly days: readonly AgendaDay[];
}

/** The server-computed "today" anchor; the client never does tz math. */
export interface CalendarToday {
  readonly homeTimezone: string;
  /** Calendar date ("YYYY-MM-DD") of now in the home timezone. */
  readonly today: string;
}
