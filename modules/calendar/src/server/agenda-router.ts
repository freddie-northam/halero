import {
  addDaysToDateString,
  dateStringInZone,
  startOfDayInZone,
} from "@halero/connector-sdk";
import { calendarEvents, entities, settings } from "@halero/db";
import type { ModuleDb } from "@halero/module-sdk/server";
import { CALENDAR_EVENT_KIND, UNTITLED_EVENT_TITLE } from "@halero/schemas";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import type { Agenda, AgendaDay, AgendaEvent } from "../contract";
import { moduleRouter, protectedProcedure } from "./trpc";

const DEFAULT_AGENDA_DAYS = 7;

const agendaInput = z
  .object({ days: z.number().int().min(1).max(31).optional() })
  .optional();

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

/** Days come back sorted, all-day events leading each day. */
const groupByDay = (
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
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayEvents]) => ({
      date,
      events: [...dayEvents].sort(compareEvents),
    }));
};

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
    const rows = ctx.db
      .select({
        entityId: entities.id,
        title: entities.title,
        occurredStart: entities.occurredStart,
        occurredEnd: entities.occurredEnd,
        allDay: calendarEvents.allDay,
        location: calendarEvents.location,
        calendarId: calendarEvents.calendarId,
      })
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
      .all();
    const events = rows
      .filter((row) => row.occurredStart !== null)
      .map(
        (row): AgendaEvent => ({
          entityId: row.entityId,
          title: row.title ?? UNTITLED_EVENT_TITLE,
          allDay: row.allDay === 1,
          start: row.occurredStart ?? 0,
          end: row.occurredEnd ?? row.occurredStart ?? 0,
          location: row.location,
          calendarId: row.calendarId,
        }),
      );
    const agenda: Agenda = {
      homeTimezone,
      days: groupByDay(events, homeTimezone),
    };
    return agenda;
  }),
});
