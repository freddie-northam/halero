// Pure mapping from a Google Calendar event JSON object to Halero's
// spine + calendar_events satellite shape. No DB, no fetch: unit-testable
// on plain objects.

import { startOfDayInZone } from "@halero/connector-sdk";
import type { SpineInput } from "@halero/core";
import { CALENDAR_EVENT_KIND } from "@halero/schemas";
import { asRecord, stringOrNull } from "./common";

export const UNTITLED_EVENT_TITLE = "(untitled event)";
const SNIPPET_MAX_LENGTH = 280;
const CALENDAR_EVENT_SCHEMA_VERSION = 1;

export interface CalendarEventSatellite {
  readonly calendarId: string;
  readonly allDay: 0 | 1;
  /** Google's all-day date strings, stored verbatim; endDate is EXCLUSIVE. */
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly location: string | null;
  readonly status: string | null;
  readonly recurringEventId: string | null;
  readonly originalStartTime: string | null;
  readonly raw: string;
}

export interface MappedUpsert {
  readonly kind: "upsert";
  readonly externalId: string;
  readonly etag: string | null;
  readonly spine: SpineInput;
  readonly satellite: CalendarEventSatellite;
}

export interface MappedCancellation {
  readonly kind: "cancelled";
  readonly externalId: string;
}

export type MappedEvent = MappedUpsert | MappedCancellation;

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

const snippetFrom = (description: string | null): string | null =>
  description === null ? null : description.slice(0, SNIPPET_MAX_LENGTH);

/**
 * Returns null when the item has no id (nothing to key it by). Cancelled
 * items map to a cancellation marker; the sync engine decides whether it
 * may tombstone (the event could have moved to another calendar).
 */
export const mapGoogleEvent = (
  event: Record<string, unknown>,
  calendarId: string,
  homeTimezone: string,
): MappedEvent | null => {
  const externalId = stringOrNull(event.id);
  if (externalId === null) {
    return null;
  }
  const status = stringOrNull(event.status);
  if (status === "cancelled") {
    return { kind: "cancelled", externalId };
  }
  const times = eventTimes(event, homeTimezone);
  const originalStart = timeField(event.originalStartTime);
  return {
    kind: "upsert",
    externalId,
    etag: stringOrNull(event.etag),
    spine: {
      kind: CALENDAR_EVENT_KIND,
      schemaVersion: CALENDAR_EVENT_SCHEMA_VERSION,
      title: stringOrNull(event.summary) ?? UNTITLED_EVENT_TITLE,
      snippet: snippetFrom(stringOrNull(event.description)),
      occurredStart: times.occurredStart,
      occurredEnd: times.occurredEnd,
      source: "connector",
    },
    satellite: {
      calendarId,
      allDay: times.allDay ? 1 : 0,
      startDate: times.startDate,
      endDate: times.endDate,
      location: stringOrNull(event.location),
      status,
      recurringEventId: stringOrNull(event.recurringEventId),
      originalStartTime: originalStart.dateTime ?? originalStart.date,
      raw: JSON.stringify(event),
    },
  };
};
