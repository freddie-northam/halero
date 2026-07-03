// The calendar module's tRPC router: the agenda (server-anchored at
// today), the range query the month/week/agenda views fetch, and the
// today anchor. All day windows are computed here in the home timezone;
// the client only renders what these queries group.

import {
  addDaysToDateString,
  dateStringInZone,
  instantInZone,
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
  CalendarEventList,
  CalendarRange,
  CalendarToday,
} from "../contract";
import { moduleRouter, protectedProcedure } from "./trpc";

/** The calendar.event satellite schema version this build stores. */
export const CALENDAR_EVENT_SCHEMA_VERSION = 1;

/** The single satellite calendarId every user-created event stores. */
const HALERO_LOCAL_CALENDAR_ID = "halero-local";

const DEFAULT_AGENDA_DAYS = 7;
const RANGE_CAP_DAYS = 62;
const DAY_MS = 86_400_000;
const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY_PATTERN = /^\d{2}:\d{2}$/;
const TITLE_MAX_LENGTH = 200;

const agendaInput = z
  .object({ days: z.number().int().min(1).max(31).optional() })
  .optional();

// Shape only; the handler validates values itself so rejections carry
// readable messages instead of zod issue dumps.
const rangeInput = z.object({ from: z.string(), to: z.string() });

const entityIdInput = z.object({ entityId: z.string() });

// Shape only; the handlers validate values themselves so rejections
// carry readable messages instead of zod issue dumps. Optional fields
// are conditionally required depending on allDay (checked in the
// handler): endDate only makes sense for all-day events, startTime and
// endTime are required for timed ones.
const eventInput = z.object({
  title: z.string(),
  allDay: z.boolean(),
  date: z.string(),
  endDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  url: z.string().optional(),
});

const createInput = eventInput;
const updateInput = eventInput.extend({ entityId: z.string() });

type EventInput = z.infer<typeof eventInput>;

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

const assertValidEventDate = (value: string): void => {
  if (!isCalendarDate(value)) {
    throw badRequest(`"${value}" is not a calendar date; expected YYYY-MM-DD.`);
  }
};

const validatedTitle = (raw: string): string => {
  const title = raw.trim();
  if (title.length === 0) {
    throw badRequest("An event needs a title.");
  }
  if (title.length > TITLE_MAX_LENGTH) {
    throw badRequest(
      `Event titles are limited to ${TITLE_MAX_LENGTH} characters.`,
    );
  }
  return title;
};

const isTimeOfDay = (value: string): boolean => {
  if (!TIME_OF_DAY_PATTERN.test(value)) {
    return false;
  }
  const [hourText, minuteText] = value.split(":");
  return Number(hourText) <= 23 && Number(minuteText) <= 59;
};

const assertValidTimeOfDay = (value: string): void => {
  if (!isTimeOfDay(value)) {
    throw badRequest(`"${value}" is not a time of day; expected HH:MM (24h).`);
  }
};

/** The spine snippet mirrors notes, like the Google mapper's description
 * snippet, so a user event is full-text searchable on its notes. */
const eventSnippet = (notes: string | null): string => (notes ?? "").trim();

/** The fields the spine and satellite both need, derived once from the
 * validated input so create and update compute them identically. */
interface EventComputed {
  readonly title: string;
  readonly allDay: boolean;
  readonly startDate: string | null;
  /** Exclusive, all-day only; null for timed events. */
  readonly endDate: string | null;
  readonly location: string | null;
  readonly notes: string | null;
  readonly url: string | null;
  readonly occurredStart: number;
  readonly occurredEnd: number;
}

const validatedAllDayFields = (
  input: EventInput,
  homeTimezone: string,
): Pick<
  EventComputed,
  "startDate" | "endDate" | "occurredStart" | "occurredEnd"
> => {
  if (input.endDate !== undefined && input.endDate < input.date) {
    throw badRequest("An event's end date cannot be before its start date.");
  }
  const storedEndDate = addDaysToDateString(input.endDate ?? input.date, 1);
  return {
    startDate: input.date,
    endDate: storedEndDate,
    occurredStart: startOfDayInZone(input.date, homeTimezone),
    occurredEnd: startOfDayInZone(storedEndDate, homeTimezone),
  };
};

const validatedTimedFields = (
  input: EventInput,
  homeTimezone: string,
): Pick<
  EventComputed,
  "startDate" | "endDate" | "occurredStart" | "occurredEnd"
> => {
  if (input.startTime === undefined || input.endTime === undefined) {
    throw badRequest("A timed event needs a start and end time.");
  }
  assertValidTimeOfDay(input.startTime);
  assertValidTimeOfDay(input.endTime);
  const occurredStart = instantInZone(
    input.date,
    input.startTime,
    homeTimezone,
  );
  const occurredEnd = instantInZone(input.date, input.endTime, homeTimezone);
  if (occurredEnd <= occurredStart) {
    throw badRequest("An event's end time must be after its start time.");
  }
  return { startDate: null, endDate: null, occurredStart, occurredEnd };
};

const validatedEventInput = (
  input: EventInput,
  homeTimezone: string,
): EventComputed => {
  const title = validatedTitle(input.title);
  assertValidEventDate(input.date);
  if (input.endDate !== undefined) {
    assertValidEventDate(input.endDate);
  }
  const timed = input.allDay
    ? validatedAllDayFields(input, homeTimezone)
    : validatedTimedFields(input, homeTimezone);
  return {
    title,
    allDay: input.allDay,
    location: input.location ?? null,
    notes: input.notes ?? null,
    url: input.url ?? null,
    ...timed,
  };
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
  readonly notes: string | null;
  readonly url: string | null;
  readonly source: "user" | "connector";
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
  notes: calendarEvents.notes,
  url: calendarEvents.url,
  source: entities.source,
};

const toAgendaEvent = (row: EventRow): AgendaEvent => ({
  entityId: row.entityId,
  title: row.title ?? UNTITLED_EVENT_TITLE,
  allDay: row.allDay === 1,
  start: row.occurredStart ?? 0,
  end: row.occurredEnd ?? row.occurredStart ?? 0,
  location: row.location,
  calendarId: row.calendarId,
  notes: row.notes,
  url: row.url,
  editable: row.source === "user",
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

/** Reads one event back after a write; the row is known to exist. */
const readEvent = (db: ModuleDb, entityId: string): AgendaEvent => {
  const row = db
    .select(eventColumns)
    .from(entities)
    .innerJoin(calendarEvents, eq(calendarEvents.entityId, entities.id))
    .where(eq(entities.id, entityId))
    .get();
  if (row === undefined) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "This event could not be read back after saving.",
    });
  }
  return toAgendaEvent(row);
};

const eventGuardColumns = {
  deletedAt: entities.deletedAt,
  source: entities.source,
};

/**
 * Update and delete only accept entities that ARE calendar events, and
 * the router rejects connector-owned and tombstoned ones up front with
 * semantic statuses (403/404) instead of letting the store's plain
 * Errors surface as 500s. The store's own guards stay as the defensive
 * backstop. Delete opts into tombstones (allowTombstoned) so a repeat
 * call stays an idempotent no-op, mirroring the tasks router's guard.
 */
const requireCalendarEventSatellite = (
  db: ModuleDb,
  entityId: string,
  options: { readonly allowTombstoned?: boolean } = {},
) => {
  const row = db
    .select(eventGuardColumns)
    .from(calendarEvents)
    .innerJoin(entities, eq(entities.id, calendarEvents.entityId))
    .where(eq(calendarEvents.entityId, entityId))
    .get();
  if (row === undefined) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This item is not a calendar event.",
    });
  }
  if (row.source === "connector") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This item is managed by a connector sync and cannot be edited.",
    });
  }
  if (row.deletedAt !== null && options.allowTombstoned !== true) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This event was deleted.",
    });
  }
  return row;
};

/** The satellite insert/update values a validated event computes to. */
const eventSatelliteValues = (computed: EventComputed) => ({
  allDay: computed.allDay ? 1 : 0,
  startDate: computed.startDate,
  endDate: computed.endDate,
  location: computed.location,
  notes: computed.notes,
  url: computed.url,
});

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

  // The flat list-view feed: unlike range, an event appears exactly
  // once regardless of how many days it spans (eventsIntersecting
  // already returns one row per event; range's per-day duplication
  // happens in the grouping step, which this skips).
  events: protectedProcedure.input(rangeInput).query(({ ctx, input }) => {
    assertValidRange(input.from, input.to);
    const homeTimezone = homeTimezoneOf(ctx.db);
    const windowStart = startOfDayInZone(input.from, homeTimezone);
    const windowEnd = startOfDayInZone(input.to, homeTimezone);
    const events = eventsIntersecting(ctx.db, windowStart, windowEnd);
    const list: CalendarEventList = {
      homeTimezone,
      events: [...events].sort(compareEvents),
    };
    return list;
  }),

  createEvent: protectedProcedure
    .input(createInput)
    .mutation(({ ctx, input }) => {
      const homeTimezone = homeTimezoneOf(ctx.db);
      const computed = validatedEventInput(input, homeTimezone);
      const snippet = eventSnippet(computed.notes);
      return ctx.entities.withTransaction(() => {
        const { entityId } = ctx.entities.createUserEntity({
          kind: CALENDAR_EVENT_KIND,
          schemaVersion: CALENDAR_EVENT_SCHEMA_VERSION,
          title: computed.title,
          ...(snippet === "" ? {} : { snippet }),
          occurredStart: computed.occurredStart,
          occurredEnd: computed.occurredEnd,
        });
        ctx.db
          .insert(calendarEvents)
          .values({
            entityId,
            calendarId: HALERO_LOCAL_CALENDAR_ID,
            status: "confirmed",
            recurringEventId: null,
            originalStartTime: null,
            raw: null,
            ...eventSatelliteValues(computed),
          })
          .run();
        return readEvent(ctx.db, entityId);
      });
    }),

  // Full replace: the modal is a full form, so update recomputes every
  // spine and satellite field from the submitted shape rather than
  // patching around the all-day/timed boundary.
  updateEvent: protectedProcedure
    .input(updateInput)
    .mutation(({ ctx, input }) => {
      requireCalendarEventSatellite(ctx.db, input.entityId);
      const homeTimezone = homeTimezoneOf(ctx.db);
      const computed = validatedEventInput(input, homeTimezone);
      const snippet = eventSnippet(computed.notes);
      return ctx.entities.withTransaction(() => {
        ctx.entities.updateUserEntity(input.entityId, {
          title: computed.title,
          snippet,
          occurredStart: computed.occurredStart,
          occurredEnd: computed.occurredEnd,
        });
        ctx.db
          .update(calendarEvents)
          .set(eventSatelliteValues(computed))
          .where(eq(calendarEvents.entityId, input.entityId))
          .run();
        return readEvent(ctx.db, input.entityId);
      });
    }),

  // Idempotent: the satellite row survives the soft delete, so a repeat
  // call passes the guard (tombstones allowed here, unlike update) and
  // the store treats it as a no-op.
  deleteEvent: protectedProcedure
    .input(entityIdInput)
    .mutation(({ ctx, input }) => {
      requireCalendarEventSatellite(ctx.db, input.entityId, {
        allowTombstoned: true,
      });
      ctx.entities.deleteUserEntity(input.entityId);
      return { entityId: input.entityId };
    }),
});
