// Pure date and time shaping for the Today's Agenda command. The server
// hands over epoch instants plus the home timezone; formatting happens
// here so rows show home-timezone wall-clock times wherever Raycast runs.

const DAY_MS = 86_400_000;

// Pinned to @halero/connector-sdk's addDaysToDateString semantics: pure
// calendar arithmetic in UTC, so no timezone can shift the date. The
// extension redeclares it to keep workspace runtime imports out of the
// bundle (the api.ts type-only import rule).
export const addDaysToDate = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

/** "HH:MM" wall-clock time in the given zone (the web calendar format). */
export const formatEventTime = (epochMs: number, timeZone: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(epochMs);

interface TimedEvent {
  readonly allDay: boolean;
  readonly start: number;
  readonly end: number;
}

/** The accessory label for an agenda row. */
export const eventTimeLabel = (event: TimedEvent, timeZone: string): string =>
  event.allDay
    ? "all day"
    : `${formatEventTime(event.start, timeZone)} - ${formatEventTime(event.end, timeZone)}`;
