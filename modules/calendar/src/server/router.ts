// The calendar module's tRPC router: the agenda (server-anchored at
// today), the range query the month/week/agenda views fetch, and the
// today anchor. All day windows are computed here in the home timezone;
// the client only renders what these queries group.

import {
  addDaysToDateString,
  dateStringInZone,
  startOfDayInZone,
} from "@halero/connector-sdk";
import { calendarEvents, entities, settings } from "@halero/db";
import type { ModuleDb } from "@halero/module-sdk/server";
import { CALENDAR_EVENT_KIND, UNTITLED_EVENT_TITLE } from "@halero/schemas";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, gte, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import type {
  Agenda,
  AgendaDay,
  AgendaEvent,
  CalendarRange,
  CalendarToday,
} from "../contract";
import { moduleRouter, protectedProcedure } from "./trpc";

const DEFAULT_AGENDA_DAYS = 7;
const RANGE_CAP_DAYS = 62;
const DAY_MS = 86_400_000;
const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const agendaInput = z
  .object({ days: z.number().int().min(1).max(31).optional() })
  .optional();

// Shape only; the handler validates values itself so rejections carry
// readable messages instead of zod issue dumps.
const rangeInput = z.object({ from: z.string(), to: z.string() });

const homeTimezoneOf = (db: ModuleDb): string =>
  db.select().from(settings).where(eq(settings.key, "home_timezone")).get()
    ?.value ?? "UTC";

const compareEvents = (a: AgendaEvent, b: AgendaEvent): number => {
  if (a.allDay !== b.allDay) {
    return a.allDay ? -1 : 1;
  }
  if (a.start !== b.start) {
    return a.start - b.start;
  }
  return a.title.localeCompare(b.title);
};

const sortedDayGroups = (
  byDate: ReadonlyMap<string, readonly AgendaEvent[]>,
): readonly AgendaDay[] =>
  [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayEvents]) => ({
      date,
      events: [...dayEvents].sort(compareEvents),
    }));

/** Days come back sorted, all-day events leading each day. */
const groupByStartDay = (
  events: readonly AgendaEvent[],
  timeZone: string,
): readonly AgendaDay[] => {
  const byDate = new Map<string, AgendaEvent[]>();
  for (const event of events) {
    const date = dateStringInZone(event.start, timeZone);
    const bucket = byDate.get(date) ?? [];
    bucket.push(event);
    byDate.set(date, bucket);
  }
  return sortedDayGroups(byDate);
};

/**
 * The home-timezone dates an event's [start, end) window covers, clamped
 * to [from, to). Zero-length events count on their start date; the
 * exclusive end means an event ending at midnight does NOT reach the
 * next day. Walking date strings keeps this DST-proof: consecutive local
 * days are consecutive calendar dates however long each day is.
 */
const datesCovered = (
  event: AgendaEvent,
  from: string,
  to: string,
  timeZone: string,
): readonly string[] => {
  const lastInstant = event.end > event.start ? event.end - 1 : event.start;
  const firstDate = dateStringInZone(event.start, timeZone);
  const lastDate = dateStringInZone(lastInstant, timeZone);
  const dates: string[] = [];
  let cursor = firstDate < from ? from : firstDate;
  while (cursor <= lastDate && cursor < to) {
    dates.push(cursor);
    cursor = addDaysToDateString(cursor, 1);
  }
  return dates;
};

/** Multi-day events appear under EVERY day they intersect. */
const groupBySpannedDays = (
  events: readonly AgendaEvent[],
  from: string,
  to: string,
  timeZone: string,
): readonly AgendaDay[] => {
  const byDate = new Map<string, AgendaEvent[]>();
  for (const event of events) {
    for (const date of datesCovered(event, from, to, timeZone)) {
      const bucket = byDate.get(date) ?? [];
      bucket.push(event);
      byDate.set(date, bucket);
    }
  }
  return sortedDayGroups(byDate);
};

const badRequest = (message: string): TRPCError =>
  new TRPCError({ code: "BAD_REQUEST", message });

const isCalendarDate = (value: string): boolean => {
  if (!DATE_STRING_PATTERN.test(value)) {
    return false;
  }
  // Round-trip because some engines roll 2023-02-31 over to March 3rd.
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
};

const assertValidRange = (from: string, to: string): void => {
  for (const value of [from, to]) {
    if (!isCalendarDate(value)) {
      throw badRequest(
        `"${value}" is not a calendar date; expected YYYY-MM-DD.`,
      );
    }
  }
  if (from >= to) {
    throw badRequest("The range start date must come before its end date.");
  }
  const days =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
  if (days > RANGE_CAP_DAYS) {
    throw badRequest(
      `Calendar ranges are limited to ${RANGE_CAP_DAYS} days at a time.`,
    );
  }
};

interface EventRow {
  readonly entityId: string;
  readonly title: string | null;
  readonly occurredStart: number | null;
  readonly occurredEnd: number | null;
  readonly allDay: number;
  readonly location: string | null;
  readonly calendarId: string;
  readonly recurringEventId: string | null;
}

const eventColumns = {
  entityId: entities.id,
  title: entities.title,
  occurredStart: entities.occurredStart,
  occurredEnd: entities.occurredEnd,
  allDay: calendarEvents.allDay,
  location: calendarEvents.location,
  calendarId: calendarEvents.calendarId,
  recurringEventId: calendarEvents.recurringEventId,
};

const toAgendaEvent = (row: EventRow): AgendaEvent => ({
  entityId: row.entityId,
  title: row.title ?? UNTITLED_EVENT_TITLE,
  allDay: row.allDay === 1,
  start: row.occurredStart ?? 0,
  end: row.occurredEnd ?? row.occurredStart ?? 0,
  location: row.location,
  calendarId: row.calendarId,
  recurring: row.recurringEventId !== null,
});

/** Live calendar events whose start falls inside [windowStart, windowEnd). */
const eventsStartingIn = (
  db: ModuleDb,
  windowStart: number,
  windowEnd: number,
): readonly AgendaEvent[] =>
  db
    .select(eventColumns)
    .from(entities)
    .innerJoin(calendarEvents, eq(calendarEvents.entityId, entities.id))
    .where(
      and(
        eq(entities.kind, CALENDAR_EVENT_KIND),
        isNull(entities.deletedAt),
        gte(entities.occurredStart, windowStart),
        lt(entities.occurredStart, windowEnd),
      ),
    )
    .all()
    .filter((row) => row.occurredStart !== null)
    .map(toAgendaEvent);

/**
 * Live calendar events whose [start, end) window intersects the given
 * one. Zero-length events (and null ends) count when their start is
 * inside the window.
 */
const eventsIntersecting = (
  db: ModuleDb,
  windowStart: number,
  windowEnd: number,
): readonly AgendaEvent[] =>
  db
    .select(eventColumns)
    .from(entities)
    .innerJoin(calendarEvents, eq(calendarEvents.entityId, entities.id))
    .where(
      and(
        eq(entities.kind, CALENDAR_EVENT_KIND),
        isNull(entities.deletedAt),
        lt(entities.occurredStart, windowEnd),
        or(
          gt(entities.occurredEnd, windowStart),
          gte(entities.occurredStart, windowStart),
        ),
      ),
    )
    .all()
    .filter((row) => row.occurredStart !== null)
    .map(toAgendaEvent);

export const calendarRouter = moduleRouter({
  agenda: protectedProcedure.input(agendaInput).query(({ ctx, input }) => {
    const days = input?.days ?? DEFAULT_AGENDA_DAYS;
    const homeTimezone = homeTimezoneOf(ctx.db);
    const today = dateStringInZone(ctx.now(), homeTimezone);
    const windowStart = startOfDayInZone(today, homeTimezone);
    const windowEnd = startOfDayInZone(
      addDaysToDateString(today, days),
      homeTimezone,
    );
    const events = eventsStartingIn(ctx.db, windowStart, windowEnd);
    const agenda: Agenda = {
      homeTimezone,
      days: groupByStartDay(events, homeTimezone),
    };
    return agenda;
  }),

  range: protectedProcedure.input(rangeInput).query(({ ctx, input }) => {
    assertValidRange(input.from, input.to);
    const homeTimezone = homeTimezoneOf(ctx.db);
    const windowStart = startOfDayInZone(input.from, homeTimezone);
    const windowEnd = startOfDayInZone(input.to, homeTimezone);
    const events = eventsIntersecting(ctx.db, windowStart, windowEnd);
    const range: CalendarRange = {
      homeTimezone,
      days: groupBySpannedDays(events, input.from, input.to, homeTimezone),
    };
    return range;
  }),

  today: protectedProcedure.query(({ ctx }) => {
    const homeTimezone = homeTimezoneOf(ctx.db);
    const today: CalendarToday = {
      homeTimezone,
      today: dateStringInZone(ctx.now(), homeTimezone),
    };
    return today;
  }),
});
