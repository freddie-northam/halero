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
import { and, asc, eq, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type {
  Task,
  TaskBoard,
  TaskList,
  TaskPriority,
  TaskStatus,
  TasksToday,
} from "../contract";
import { moduleRouter, protectedProcedure } from "./trpc";

/** The task.item satellite schema version this build stores. */
export const TASK_ITEM_SCHEMA_VERSION = 1;

const TITLE_MAX_LENGTH = 200;
const TAG_MAX_LENGTH = 40;
const TAGS_MAX_COUNT = 12;
const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const PRIORITIES: readonly TaskPriority[] = ["high", "medium", "low"];
const TASK_STATUSES: readonly TaskStatus[] = ["todo", "doing", "done"];

const listInput = z
  .object({ filter: z.enum(["todo", "done", "all"]).optional() })
  .optional();

const moveInput = z.object({
  entityId: z.string(),
  status: z.string(),
  // Not z.number(): zod 4 rejects NaN/Infinity at the schema layer with
  // a raw issue dump, but validatedSortOrder below needs a chance to
  // reject them with a readable message instead.
  sortOrder: z.custom<number>((value) => typeof value === "number"),
});

// Shape only; the handlers validate values themselves so rejections
// carry readable messages instead of zod issue dumps.
const createInput = z.object({
  title: z.string(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  priority: z.string().optional(),
  tags: z.array(z.string()).optional(),
  estimateMinutes: z.number().optional(),
});

const updateInput = z.object({
  entityId: z.string(),
  title: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  // No null variant: an empty array clears, mirroring the [] the read
  // side returns for an untagged task.
  tags: z.array(z.string()).optional(),
  estimateMinutes: z.number().nullable().optional(),
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

const isPriority = (value: string): value is TaskPriority =>
  (PRIORITIES as readonly string[]).includes(value);

const validatedPriority = (raw: string): TaskPriority => {
  if (!isPriority(raw)) {
    throw badRequest(
      `"${raw}" is not a task priority; expected high, medium, or low.`,
    );
  }
  return raw;
};

/** Trims, rejects blanks and oversizes readably, and deduplicates. */
const validatedTags = (raw: readonly string[]): readonly string[] => {
  const tags: string[] = [];
  for (const rawTag of raw) {
    const tag = rawTag.trim();
    if (tag.length === 0) {
      throw badRequest("Tags cannot be empty.");
    }
    if (tag.length > TAG_MAX_LENGTH) {
      throw badRequest(`Tags are limited to ${TAG_MAX_LENGTH} characters.`);
    }
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }
  if (tags.length > TAGS_MAX_COUNT) {
    throw badRequest(`A task can have at most ${TAGS_MAX_COUNT} tags.`);
  }
  return tags;
};

const isTaskStatus = (value: string): value is TaskStatus =>
  (TASK_STATUSES as readonly string[]).includes(value);

const validatedStatus = (raw: string): TaskStatus => {
  if (!isTaskStatus(raw)) {
    throw badRequest(
      `"${raw}" is not a task status; expected todo, doing, or done.`,
    );
  }
  return raw;
};

/** Fractional on purpose (a drag midpoint); only NaN/Infinity are invalid. */
const validatedSortOrder = (raw: number): number => {
  if (!Number.isFinite(raw)) {
    throw badRequest("The sort position must be a finite number.");
  }
  return raw;
};

const validatedEstimate = (raw: number): number => {
  if (!Number.isInteger(raw) || raw < 0) {
    throw badRequest(
      "The estimate must be a whole number of minutes, zero or more.",
    );
  }
  return raw;
};

/** null for no tags so the column reads NULL, not "[]". */
const tagsColumnValue = (tags: readonly string[]): string | null =>
  tags.length === 0 ? null : JSON.stringify(tags);

const parseTags = (raw: string | null): readonly string[] => {
  if (raw === null) {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed)
    ? parsed.filter((tag): tag is string => typeof tag === "string")
    : [];
};

/**
 * The spine snippet mirrors tags and notes so both are full-text
 * searchable; recomputed whenever either half changes. Empty string
 * (not null: the store's patch type is string-only) when both are gone.
 */
const taskSnippet = (tags: readonly string[], notes: string | null): string => {
  const noteText = notes?.trim() ?? "";
  return [tags.join(" "), noteText]
    .filter((part) => part.length > 0)
    .join("\n");
};

/**
 * The end of a status column: past every live AND migrated row there.
 * Migration 0006 seeded sort_order from rowid (1..N), so "append" must
 * be max+1 over the whole column, never a fresh 0-based counter.
 */
const nextSortOrder = (
  db: ModuleDb,
  status: "todo" | "doing" | "done",
): number => {
  const row = db
    .select({ value: sql<number | null>`max(${tasks.sortOrder})` })
    .from(tasks)
    .where(eq(tasks.status, status))
    .get();
  return (row?.value ?? 0) + 1;
};

const taskColumns = {
  entityId: entities.id,
  title: entities.title,
  status: tasks.status,
  priority: tasks.priority,
  tags: tasks.tags,
  dueDate: tasks.dueDate,
  notes: tasks.notes,
  estimateMinutes: tasks.estimateMinutes,
  loggedMinutes: tasks.loggedMinutes,
  sortOrder: tasks.sortOrder,
  completedAt: tasks.completedAt,
};

interface TaskRow {
  readonly entityId: string;
  readonly title: string | null;
  readonly status: "todo" | "doing" | "done";
  readonly priority: TaskPriority | null;
  readonly tags: string | null;
  readonly dueDate: string | null;
  readonly notes: string | null;
  readonly estimateMinutes: number | null;
  readonly loggedMinutes: number;
  readonly sortOrder: number;
  readonly completedAt: number | null;
}

const toTask = (row: TaskRow): Task => ({
  entityId: row.entityId,
  title: row.title ?? "",
  status: row.status,
  priority: row.priority,
  tags: parseTags(row.tags),
  dueDate: row.dueDate,
  notes: row.notes,
  estimateMinutes: row.estimateMinutes,
  loggedMinutes: row.loggedMinutes,
  sortOrder: row.sortOrder,
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

const taskGuardColumns = {
  status: tasks.status,
  // update's snippet recompute needs the halves the patch omits; move's
  // done-boundary check needs the current completedAt to preserve it
  // when the status isn't actually crossing into or out of done.
  tags: tasks.tags,
  notes: tasks.notes,
  completedAt: tasks.completedAt,
  deletedAt: entities.deletedAt,
  source: entities.source,
};

/**
 * Update, toggle, and delete only accept entities that ARE tasks, and
 * the router rejects connector-owned and tombstoned ones up front with
 * semantic statuses (403/404) instead of letting the store's plain
 * Errors surface as 500s. The store's own guards stay as the defensive
 * backstop. The satellite row survives a soft delete, so delete opts
 * into tombstones (allowTombstoned) to keep its idempotent no-op.
 */
const requireTaskSatellite = (
  db: ModuleDb,
  entityId: string,
  options: { readonly allowTombstoned?: boolean } = {},
) => {
  const row = db
    .select(taskGuardColumns)
    .from(tasks)
    .innerJoin(entities, eq(entities.id, tasks.entityId))
    .where(eq(tasks.entityId, entityId))
    .get();
  if (row === undefined) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This item is not a task.",
    });
  }
  if (row.source === "connector") {
    throw new TRPCError({
      code: "FORBIDDEN",
      // The entity store's own message; the store remains the backstop.
      message: "This item is managed by a connector sync and cannot be edited.",
    });
  }
  if (row.deletedAt !== null && options.allowTombstoned !== true) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This task was deleted.",
    });
  }
  return row;
};

const statusFilter = (filter: "todo" | "done" | "all") =>
  filter === "all" ? undefined : eq(tasks.status, filter);

/** Live tasks, due-dated first (soonest first), then dateless; ties by
 * creation time. */
const liveTasks = (
  db: ModuleDb,
  filter: "todo" | "done" | "all",
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

/** Live non-done tasks due on or before the given date: overdue included. */
const dueTasks = (db: ModuleDb, today: string): readonly Task[] =>
  db
    .select(taskColumns)
    .from(entities)
    .innerJoin(tasks, eq(tasks.entityId, entities.id))
    .where(
      and(
        eq(entities.kind, TASK_ITEM_KIND),
        isNull(entities.deletedAt),
        ne(tasks.status, "done"),
        isNotNull(tasks.dueDate),
        lte(tasks.dueDate, today),
      ),
    )
    .orderBy(asc(tasks.dueDate), asc(entities.createdAt))
    .all()
    .map(toTask);

/**
 * Every live task grouped into its board column, sort_order first then
 * created_at as the tie-break (matches migration 0006's rowid seeding).
 * A single globally sorted query is bucketed by status rather than
 * three separate queries: since the order is stable, partitioning the
 * already-sorted rows preserves each column's relative order.
 */
const boardColumns = (
  db: ModuleDb,
): { todo: Task[]; doing: Task[]; done: Task[] } => {
  const columns = { todo: [], doing: [], done: [] } as {
    todo: Task[];
    doing: Task[];
    done: Task[];
  };
  const rows = db
    .select(taskColumns)
    .from(entities)
    .innerJoin(tasks, eq(tasks.entityId, entities.id))
    .where(and(eq(entities.kind, TASK_ITEM_KIND), isNull(entities.deletedAt)))
    .orderBy(asc(tasks.sortOrder), asc(entities.createdAt))
    .all()
    .map(toTask);
  for (const task of rows) {
    columns[task.status].push(task);
  }
  return columns;
};

/** An update with every provided field validated; omissions preserve. */
interface TaskFieldPatch {
  readonly title?: string;
  readonly dueDate?: string | null;
  readonly notes?: string | null;
  readonly priority?: TaskPriority | null;
  readonly tags?: readonly string[];
  readonly estimateMinutes?: number | null;
}

type UpdateInput = z.infer<typeof updateInput>;

const validatedPatch = (input: UpdateInput): TaskFieldPatch => {
  if (typeof input.dueDate === "string") {
    assertValidDueDate(input.dueDate);
  }
  return {
    ...(input.title === undefined
      ? {}
      : { title: validatedTitle(input.title) }),
    ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    ...(input.priority === undefined
      ? {}
      : {
          priority:
            input.priority === null ? null : validatedPriority(input.priority),
        }),
    ...(input.tags === undefined ? {} : { tags: validatedTags(input.tags) }),
    ...(input.estimateMinutes === undefined
      ? {}
      : {
          estimateMinutes:
            input.estimateMinutes === null
              ? null
              : validatedEstimate(input.estimateMinutes),
        }),
  };
};

/**
 * Omission preserves; a null due date clears the spine anchor. The
 * snippet is recomputed whenever tags or notes change, pulling the
 * untouched half from the current satellite row.
 */
const spinePatch = (
  patch: TaskFieldPatch,
  current: { readonly tags: string | null; readonly notes: string | null },
  homeTimezone: string,
): UpdateUserEntityPatch => ({
  ...(patch.title === undefined ? {} : { title: patch.title }),
  ...(patch.dueDate === undefined
    ? {}
    : {
        occurredStart:
          patch.dueDate === null
            ? null
            : startOfDayInZone(patch.dueDate, homeTimezone),
      }),
  ...(patch.tags === undefined && patch.notes === undefined
    ? {}
    : {
        snippet: taskSnippet(
          patch.tags ?? parseTags(current.tags),
          patch.notes === undefined ? current.notes : patch.notes,
        ),
      }),
});

const satellitePatch = (
  patch: TaskFieldPatch,
): Partial<{
  dueDate: string | null;
  notes: string | null;
  priority: TaskPriority | null;
  tags: string | null;
  estimateMinutes: number | null;
}> => ({
  ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
  ...(patch.notes === undefined ? {} : { notes: patch.notes }),
  ...(patch.priority === undefined ? {} : { priority: patch.priority }),
  ...(patch.tags === undefined ? {} : { tags: tagsColumnValue(patch.tags) }),
  ...(patch.estimateMinutes === undefined
    ? {}
    : { estimateMinutes: patch.estimateMinutes }),
});

export const tasksRouter = moduleRouter({
  list: protectedProcedure.input(listInput).query(({ ctx, input }) => {
    const list: TaskList = {
      tasks: liveTasks(ctx.db, input?.filter ?? "todo"),
    };
    return list;
  }),

  board: protectedProcedure.query(({ ctx }) => {
    const homeTimezone = homeTimezoneOf(ctx.db);
    const board: TaskBoard = {
      homeTimezone,
      today: dateStringInZone(ctx.now(), homeTimezone),
      columns: boardColumns(ctx.db),
    };
    return board;
  }),

  create: protectedProcedure.input(createInput).mutation(({ ctx, input }) => {
    const title = validatedTitle(input.title);
    if (input.dueDate !== undefined) {
      assertValidDueDate(input.dueDate);
    }
    const priority =
      input.priority === undefined ? null : validatedPriority(input.priority);
    const tags = input.tags === undefined ? [] : validatedTags(input.tags);
    const estimateMinutes =
      input.estimateMinutes === undefined
        ? null
        : validatedEstimate(input.estimateMinutes);
    const homeTimezone = homeTimezoneOf(ctx.db);
    const snippet = taskSnippet(tags, input.notes ?? null);
    return ctx.entities.withTransaction(() => {
      const { entityId } = ctx.entities.createUserEntity({
        kind: TASK_ITEM_KIND,
        schemaVersion: TASK_ITEM_SCHEMA_VERSION,
        title,
        ...(snippet === "" ? {} : { snippet }),
        ...(input.dueDate === undefined
          ? {}
          : { occurredStart: startOfDayInZone(input.dueDate, homeTimezone) }),
      });
      ctx.db
        .insert(tasks)
        .values({
          entityId,
          status: "todo",
          priority,
          tags: tagsColumnValue(tags),
          dueDate: input.dueDate ?? null,
          completedAt: null,
          notes: input.notes ?? null,
          estimateMinutes,
          // Appended to the todo column, after every migrated row.
          sortOrder: nextSortOrder(ctx.db, "todo"),
        })
        .run();
      return readTask(ctx.db, entityId);
    });
  }),

  update: protectedProcedure.input(updateInput).mutation(({ ctx, input }) => {
    const patch = validatedPatch(input);
    const current = requireTaskSatellite(ctx.db, input.entityId);
    const homeTimezone = homeTimezoneOf(ctx.db);
    return ctx.entities.withTransaction(() => {
      // Always runs, even for a satellite-only patch: it bumps
      // updated_at and enforces the store's tombstone/source guards.
      ctx.entities.updateUserEntity(
        input.entityId,
        spinePatch(patch, current, homeTimezone),
      );
      const changes = satellitePatch(patch);
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

  // The board drag: sets the column (status) and the fractional position
  // within it. The client computes sortOrder as the midpoint between the
  // two neighbor cards it dropped between (or past the end/start of the
  // column); this procedure just stores whatever it's given. Crossing
  // the done boundary sets or clears completed_at; repositioning within
  // a column (including within done) leaves it untouched.
  move: protectedProcedure.input(moveInput).mutation(({ ctx, input }) => {
    const status = validatedStatus(input.status);
    const sortOrder = validatedSortOrder(input.sortOrder);
    const current = requireTaskSatellite(ctx.db, input.entityId);
    const entering = current.status !== "done" && status === "done";
    const leaving = current.status === "done" && status !== "done";
    return ctx.entities.withTransaction(() => {
      // Bumps updated_at and enforces the store's guards.
      ctx.entities.updateUserEntity(input.entityId, {});
      ctx.db
        .update(tasks)
        .set({
          status,
          sortOrder,
          completedAt: entering
            ? ctx.now()
            : leaving
              ? null
              : current.completedAt,
        })
        .where(eq(tasks.entityId, input.entityId))
        .run();
      return readTask(ctx.db, input.entityId);
    });
  }),

  // The List checkbox's semantic: complete/reopen, always via todo.
  // "doing" is entered only through move() (a board drag); a checkbox
  // toggle on a doing task completes it, and reopening never restores
  // "doing", only "todo".
  toggle: protectedProcedure.input(entityIdInput).mutation(({ ctx, input }) => {
    const row = requireTaskSatellite(ctx.db, input.entityId);
    const completing = row.status !== "done";
    return ctx.entities.withTransaction(() => {
      // Bumps updated_at and enforces the store's guards.
      ctx.entities.updateUserEntity(input.entityId, {});
      ctx.db
        .update(tasks)
        .set({
          status: completing ? "done" : "todo",
          completedAt: completing ? ctx.now() : null,
        })
        .where(eq(tasks.entityId, input.entityId))
        .run();
      return readTask(ctx.db, input.entityId);
    });
  }),

  // Idempotent: the satellite row survives the soft delete, so a repeat
  // call passes the task guard (tombstones allowed here, unlike update
  // and toggle) and the store treats it as a no-op.
  delete: protectedProcedure.input(entityIdInput).mutation(({ ctx, input }) => {
    requireTaskSatellite(ctx.db, input.entityId, { allowTombstoned: true });
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
