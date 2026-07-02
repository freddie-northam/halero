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
}

export interface AgendaDay {
  readonly date: string;
  readonly events: readonly AgendaEvent[];
}

export interface Agenda {
  readonly homeTimezone: string;
  readonly days: readonly AgendaDay[];
}
