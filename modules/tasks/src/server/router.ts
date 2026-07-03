// The tasks module's tRPC router: CRUD over user-owned task entities
// plus the today view. Due dates are calendar dates anchored to
// home-timezone midnight on the spine; every spine write goes through
// the host's user-entity store so its source and tombstone rules hold.

import { dateStringInZone, startOfDayInZone } from "@halero/connector-sdk";
import { entities, settings, tasks } from "@halero/db";
import type {
  ModuleDb,
  UpdateUserEntityPatch,
} from "@halero/module-sdk/server";
import { TASK_ITEM_KIND } from "@halero/schemas";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Task, TaskList, TasksToday } from "../contract";
import { moduleRouter, protectedProcedure } from "./trpc";

/** The task.item satellite schema version this build stores. */
export const TASK_ITEM_SCHEMA_VERSION = 1;

const TITLE_MAX_LENGTH = 200;
const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const listInput = z
  .object({ filter: z.enum(["open", "done", "all"]).optional() })
  .optional();

// Shape only; the handlers validate values themselves so rejections
// carry readable messages instead of zod issue dumps.
const createInput = z.object({
  title: z.string(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

const updateInput = z.object({
  entityId: z.string(),
  title: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const entityIdInput = z.object({ entityId: z.string() });

const badRequest = (message: string): TRPCError =>
  new TRPCError({ code: "BAD_REQUEST", message });

const homeTimezoneOf = (db: ModuleDb): string =>
  db.select().from(settings).where(eq(settings.key, "home_timezone")).get()
    ?.value ?? "UTC";

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

const assertValidDueDate = (value: string): void => {
  if (!isCalendarDate(value)) {
    throw badRequest(`"${value}" is not a calendar date; expected YYYY-MM-DD.`);
  }
};

const validatedTitle = (raw: string): string => {
  const title = raw.trim();
  if (title.length === 0) {
    throw badRequest("A task needs a title.");
  }
  if (title.length > TITLE_MAX_LENGTH) {
    throw badRequest(
      `Task titles are limited to ${TITLE_MAX_LENGTH} characters.`,
    );
  }
  return title;
};

const taskColumns = {
  entityId: entities.id,
  title: entities.title,
  status: tasks.status,
  dueDate: tasks.dueDate,
  notes: tasks.notes,
  completedAt: tasks.completedAt,
};

interface TaskRow {
  readonly entityId: string;
  readonly title: string | null;
  readonly status: "open" | "done";
  readonly dueDate: string | null;
  readonly notes: string | null;
  readonly completedAt: number | null;
}

const toTask = (row: TaskRow): Task => ({
  entityId: row.entityId,
  title: row.title ?? "",
  status: row.status,
  dueDate: row.dueDate,
  notes: row.notes,
  completedAt: row.completedAt,
});

/** Reads one task back after a write; the row is known to exist. */
const readTask = (db: ModuleDb, entityId: string): Task => {
  const row = db
    .select(taskColumns)
    .from(entities)
    .innerJoin(tasks, eq(tasks.entityId, entities.id))
    .where(eq(entities.id, entityId))
    .get();
  if (row === undefined) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "This task could not be read back after saving.",
    });
  }
  return toTask(row);
};

/**
 * Update, toggle, and delete only accept entities that ARE tasks. The
 * satellite row survives a soft delete, so a tombstoned task passes
 * here and the entity store decides how each verb treats it (update
 * rejects, a repeat delete is a no-op).
 */
const requireTaskSatellite = (db: ModuleDb, entityId: string) => {
  const row = db.select().from(tasks).where(eq(tasks.entityId, entityId)).get();
  if (row === undefined) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This item is not a task.",
    });
  }
  return row;
};

const statusFilter = (filter: "open" | "done" | "all") =>
  filter === "all" ? undefined : eq(tasks.status, filter);

/** Live tasks, due-dated first (soonest first), then dateless; ties by
 * creation time. */
const liveTasks = (
  db: ModuleDb,
  filter: "open" | "done" | "all",
): readonly Task[] =>
  db
    .select(taskColumns)
    .from(entities)
    .innerJoin(tasks, eq(tasks.entityId, entities.id))
    .where(
      and(
        eq(entities.kind, TASK_ITEM_KIND),
        isNull(entities.deletedAt),
        statusFilter(filter),
      ),
    )
    .orderBy(
      sql`${tasks.dueDate} IS NULL`,
      asc(tasks.dueDate),
      asc(entities.createdAt),
    )
    .all()
    .map(toTask);

/** Live open tasks due on or before the given date: overdue included. */
const dueTasks = (db: ModuleDb, today: string): readonly Task[] =>
  db
    .select(taskColumns)
    .from(entities)
    .innerJoin(tasks, eq(tasks.entityId, entities.id))
    .where(
      and(
        eq(entities.kind, TASK_ITEM_KIND),
        isNull(entities.deletedAt),
        eq(tasks.status, "open"),
        isNotNull(tasks.dueDate),
        lte(tasks.dueDate, today),
      ),
    )
    .orderBy(asc(tasks.dueDate), asc(entities.createdAt))
    .all()
    .map(toTask);

/** Omission preserves; a null due date clears the spine anchor. */
const spinePatch = (
  title: string | undefined,
  dueDate: string | null | undefined,
  homeTimezone: string,
): UpdateUserEntityPatch => ({
  ...(title === undefined ? {} : { title }),
  ...(dueDate === undefined
    ? {}
    : {
        occurredStart:
          dueDate === null ? null : startOfDayInZone(dueDate, homeTimezone),
      }),
});

const satellitePatch = (input: {
  dueDate?: string | null;
  notes?: string | null;
}): Partial<{ dueDate: string | null; notes: string | null }> => ({
  ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }),
  ...(input.notes === undefined ? {} : { notes: input.notes }),
});

export const tasksRouter = moduleRouter({
  list: protectedProcedure.input(listInput).query(({ ctx, input }) => {
    const list: TaskList = {
      tasks: liveTasks(ctx.db, input?.filter ?? "open"),
    };
    return list;
  }),

  create: protectedProcedure.input(createInput).mutation(({ ctx, input }) => {
    const title = validatedTitle(input.title);
    if (input.dueDate !== undefined) {
      assertValidDueDate(input.dueDate);
    }
    const homeTimezone = homeTimezoneOf(ctx.db);
    return ctx.entities.withTransaction(() => {
      const { entityId } = ctx.entities.createUserEntity({
        kind: TASK_ITEM_KIND,
        schemaVersion: TASK_ITEM_SCHEMA_VERSION,
        title,
        ...(input.dueDate === undefined
          ? {}
          : { occurredStart: startOfDayInZone(input.dueDate, homeTimezone) }),
      });
      ctx.db
        .insert(tasks)
        .values({
          entityId,
          status: "open",
          dueDate: input.dueDate ?? null,
          completedAt: null,
          notes: input.notes ?? null,
        })
        .run();
      return readTask(ctx.db, entityId);
    });
  }),

  update: protectedProcedure.input(updateInput).mutation(({ ctx, input }) => {
    const title =
      input.title === undefined ? undefined : validatedTitle(input.title);
    if (typeof input.dueDate === "string") {
      assertValidDueDate(input.dueDate);
    }
    requireTaskSatellite(ctx.db, input.entityId);
    const homeTimezone = homeTimezoneOf(ctx.db);
    return ctx.entities.withTransaction(() => {
      // Always runs, even for a satellite-only patch: it bumps
      // updated_at and enforces the store's tombstone/source guards.
      ctx.entities.updateUserEntity(
        input.entityId,
        spinePatch(title, input.dueDate, homeTimezone),
      );
      const changes = satellitePatch(input);
      if (Object.keys(changes).length > 0) {
        ctx.db
          .update(tasks)
          .set(changes)
          .where(eq(tasks.entityId, input.entityId))
          .run();
      }
      return readTask(ctx.db, input.entityId);
    });
  }),

  toggle: protectedProcedure.input(entityIdInput).mutation(({ ctx, input }) => {
    const row = requireTaskSatellite(ctx.db, input.entityId);
    const completing = row.status === "open";
    return ctx.entities.withTransaction(() => {
      // Bumps updated_at and enforces the store's guards.
      ctx.entities.updateUserEntity(input.entityId, {});
      ctx.db
        .update(tasks)
        .set({
          status: completing ? "done" : "open",
          completedAt: completing ? ctx.now() : null,
        })
        .where(eq(tasks.entityId, input.entityId))
        .run();
      return readTask(ctx.db, input.entityId);
    });
  }),

  // Idempotent: the satellite row survives the soft delete, so a repeat
  // call passes the task guard and the store treats it as a no-op.
  delete: protectedProcedure.input(entityIdInput).mutation(({ ctx, input }) => {
    requireTaskSatellite(ctx.db, input.entityId);
    ctx.entities.deleteUserEntity(input.entityId);
    return { entityId: input.entityId };
  }),

  today: protectedProcedure.query(({ ctx }) => {
    const homeTimezone = homeTimezoneOf(ctx.db);
    const today = dateStringInZone(ctx.now(), homeTimezone);
    const view: TasksToday = {
      homeTimezone,
      today,
      tasks: dueTasks(ctx.db, today),
    };
    return view;
  }),
});
