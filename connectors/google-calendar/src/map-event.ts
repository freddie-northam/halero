// Pure mapping from a Google Calendar event JSON object to a protocol
// SyncOp. No DB, no fetch: unit-testable on plain objects.

import {
  asRecord,
  type SyncOp,
  startOfDayInZone,
  stringOrNull,
} from "@halero/connector-sdk";
import { CALENDAR_EVENT_KIND, UNTITLED_EVENT_TITLE } from "@halero/schemas";

const SNIPPET_MAX_LENGTH = 280;
export const CALENDAR_EVENT_SCHEMA_VERSION = 1;

interface EventTimes {
  readonly allDay: boolean;
  readonly occurredStart: number | null;
  readonly occurredEnd: number | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

const timeField = (
  value: unknown,
): { date: string | null; dateTime: string | null } => {
  const record = asRecord(value);
  return {
    date: record === null ? null : stringOrNull(record.date),
    dateTime: record === null ? null : stringOrNull(record.dateTime),
  };
};

const parseInstant = (dateTime: string | null): number | null => {
  if (dateTime === null) {
    return null;
  }
  const parsed = Date.parse(dateTime);
  return Number.isNaN(parsed) ? null : parsed;
};

const eventTimes = (
  event: Record<string, unknown>,
  homeTimezone: string,
): EventTimes => {
  const start = timeField(event.start);
  const end = timeField(event.end);
  if (start.date !== null) {
    // All-day: spine bounds are home-timezone midnights. Google's end date
    // is exclusive; mapping it to midnight keeps the bound exclusive too.
    const endDate = end.date ?? start.date;
    return {
      allDay: true,
      occurredStart: startOfDayInZone(start.date, homeTimezone),
      occurredEnd: startOfDayInZone(endDate, homeTimezone),
      startDate: start.date,
      endDate,
    };
  }
  const occurredStart = parseInstant(start.dateTime);
  return {
    allDay: false,
    occurredStart,
    occurredEnd: parseInstant(end.dateTime) ?? occurredStart,
    startDate: null,
    endDate: null,
  };
};

const snippetFrom = (description: string | null): string | undefined =>
  description === null ? undefined : description.slice(0, SNIPPET_MAX_LENGTH);

/**
 * Returns null when the item has no id (nothing to key it by). Cancelled
 * items map to a delete op; the HOST decides whether it may tombstone
 * (the event could have moved to another calendar stream).
 */
export const mapGoogleEvent = (
  event: Record<string, unknown>,
  calendarId: string,
  homeTimezone: string,
): SyncOp | null => {
  const externalId = stringOrNull(event.id);
  if (externalId === null) {
    return null;
  }
  const status = stringOrNull(event.status);
  if (status === "cancelled") {
    return { op: "delete", externalId };
  }
  const times = eventTimes(event, homeTimezone);
  const originalStart = timeField(event.originalStartTime);
  return {
    op: "upsert",
    externalId,
    version: stringOrNull(event.etag) ?? undefined,
    spine: {
      kind: CALENDAR_EVENT_KIND,
      schemaVersion: CALENDAR_EVENT_SCHEMA_VERSION,
      title: stringOrNull(event.summary) ?? UNTITLED_EVENT_TITLE,
      snippet: snippetFrom(stringOrNull(event.description)),
      occurredStart: times.occurredStart ?? undefined,
      occurredEnd: times.occurredEnd ?? undefined,
    },
    satellite: {
      calendarId,
      allDay: times.allDay ? 1 : 0,
      /** Google's all-day date strings, verbatim; endDate is EXCLUSIVE. */
      startDate: times.startDate,
      endDate: times.endDate,
      location: stringOrNull(event.location),
      status,
      recurringEventId: stringOrNull(event.recurringEventId),
      originalStartTime: originalStart.dateTime ?? originalStart.date,
      // The full description, not the 280-char snippet: user and Google
      // events show the same notes detail.
      notes: stringOrNull(event.description),
      // The meeting/join link, preferred over the event's own page.
      url: stringOrNull(event.hangoutLink) ?? stringOrNull(event.htmlLink),
    },
    raw: event,
  };
};
