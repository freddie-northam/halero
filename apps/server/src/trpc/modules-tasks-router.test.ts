import { describe, expect, test } from "bun:test";
import { startOfDayInZone } from "@halero/connector-sdk";
import { createEntityStore, searchEntities } from "@halero/core";
import { entities, tasks } from "@halero/db";
import { eq } from "drizzle-orm";
import {
  completeSetup,
  makeTestApp,
  sessionCookieFrom,
  type TestApp,
  type TrpcSuccess,
  trpcMutation,
  trpcQuery,
} from "../test-utils";

// The test clock (1_700_000_000_000) is 2023-11-14T22:13:20Z; London is
// on GMT in November, so "today" there is 2023-11-14.

interface TaskData {
  readonly entityId: string;
  readonly title: string;
  readonly status: "todo" | "doing" | "done";
  readonly priority: "high" | "medium" | "low" | null;
  readonly tags: readonly string[];
  readonly dueDate: string | null;
  readonly notes: string | null;
  readonly estimateMinutes: number | null;
  readonly loggedMinutes: number;
  readonly sortOrder: number;
  readonly completedAt: number | null;
}

interface TaskListData {
  readonly tasks: readonly TaskData[];
}

interface TasksTodayData {
  readonly homeTimezone: string;
  readonly today: string;
  readonly tasks: readonly TaskData[];
}

interface TaskBoardData {
  readonly homeTimezone: string;
  readonly today: string;
  readonly columns: {
    readonly todo: readonly TaskData[];
    readonly doing: readonly TaskData[];
    readonly done: readonly TaskData[];
  };
}

type TaskListFilter = "todo" | "doing" | "done" | "active" | "all";

interface TrpcErrorBody {
  readonly error: { readonly message: string };
}

interface CreateTaskInput {
  readonly title: string;
  readonly dueDate?: string;
  readonly notes?: string;
  readonly priority?: string;
  readonly tags?: readonly string[];
  readonly estimateMinutes?: number;
}

const createTask = async (
  app: TestApp["app"],
  cookie: string,
  input: CreateTaskInput,
): Promise<TaskData> => {
  const res = await trpcMutation(app, "modules.tasks.create", input, {
    cookie,
  });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<TaskData>;
  return json.result.data;
};

const listTasks = async (
  app: TestApp["app"],
  cookie: string,
  filter?: TaskListFilter,
): Promise<TaskListData> => {
  const procedure =
    filter === undefined
      ? "modules.tasks.list"
      : `modules.tasks.list?input=${encodeURIComponent(JSON.stringify({ filter }))}`;
  const res = await trpcQuery(app, procedure, { cookie });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<TaskListData>;
  return json.result.data;
};

const readToday = async (
  app: TestApp["app"],
  cookie: string,
): Promise<TasksTodayData> => {
  const res = await trpcQuery(app, "modules.tasks.today", { cookie });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<TasksTodayData>;
  return json.result.data;
};

const readBoard = async (
  app: TestApp["app"],
  cookie: string,
): Promise<TaskBoardData> => {
  const res = await trpcQuery(app, "modules.tasks.board", { cookie });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<TaskBoardData>;
  return json.result.data;
};

const moveTask = async (
  app: TestApp["app"],
  cookie: string,
  input: {
    readonly entityId: string;
    readonly status: string;
    readonly sortOrder: number;
  },
): Promise<TaskData> => {
  const res = await trpcMutation(app, "modules.tasks.move", input, { cookie });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<TaskData>;
  return json.result.data;
};

const toggleTask = async (
  app: TestApp["app"],
  cookie: string,
  entityId: string,
): Promise<TaskData> => {
  const res = await trpcMutation(
    app,
    "modules.tasks.toggle",
    { entityId },
    { cookie },
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<TaskData>;
  return json.result.data;
};

const deleteTask = async (
  app: TestApp["app"],
  cookie: string,
  entityId: string,
): Promise<void> => {
  const res = await trpcMutation(
    app,
    "modules.tasks.delete",
    { entityId },
    { cookie },
  );
  expect(res.status).toBe(200);
};

const logTime = async (
  app: TestApp["app"],
  cookie: string,
  entityId: string,
  minutes: number,
): Promise<TaskData> => {
  const res = await trpcMutation(
    app,
    "modules.tasks.logTime",
    { entityId, minutes },
    { cookie },
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<TaskData>;
  return json.result.data;
};

const mutationError = async (
  app: TestApp["app"],
  cookie: string,
  procedure: string,
  input: unknown,
  status: number,
): Promise<string> => {
  const res = await trpcMutation(app, procedure, input, { cookie });
  expect(res.status).toBe(status);
  const json = (await res.json()) as TrpcErrorBody;
  return json.error.message;
};

const readEntityRow = (testApp: TestApp, entityId: string) =>
  testApp.database.db
    .select()
    .from(entities)
    .where(eq(entities.id, entityId))
    .get();

const readSatelliteRow = (testApp: TestApp, entityId: string) =>
  testApp.database.db
    .select()
    .from(tasks)
    .where(eq(tasks.entityId, entityId))
    .get();

const setCreatedAt = (
  testApp: TestApp,
  entityId: string,
  value: number,
): void => {
  testApp.database.sqlite.run(
    "UPDATE entities SET created_at = ? WHERE id = ?",
    [value, entityId],
  );
};

/** Pins a satellite position directly, like a migrated 1..N row. */
const setSortOrder = (
  testApp: TestApp,
  entityId: string,
  value: number,
): void => {
  testApp.database.sqlite.run(
    "UPDATE tasks SET sort_order = ? WHERE entity_id = ?",
    [value, entityId],
  );
};

/** A live connector-owned task row: the store must refuse to touch it. */
const seedConnectorTask = (testApp: TestApp, id: string): void => {
  testApp.database.db
    .insert(entities)
    .values({
      id,
      kind: "task.item",
      schemaVersion: 1,
      title: "Synced task",
      snippet: null,
      occurredStart: null,
      occurredEnd: null,
      source: "connector",
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    })
    .run();
  testApp.database.db
    .insert(tasks)
    .values({
      entityId: id,
      status: "todo",
      dueDate: null,
      completedAt: null,
      notes: null,
    })
    .run();
};

const NOT_A_TASK_MESSAGE = "This item is not a task.";
const TASK_DELETED_MESSAGE = "This task was deleted.";
const CONNECTOR_MANAGED_MESSAGE =
  "This item is managed by a connector sync and cannot be edited.";

describe("modules.tasks auth", () => {
  test("every procedure rejects without a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);

    for (const procedure of [
      "modules.tasks.list",
      "modules.tasks.today",
      "modules.tasks.board",
    ]) {
      const res = await trpcQuery(app, procedure);
      expect(res.status).toBe(401);
    }
    const mutations: readonly (readonly [string, unknown])[] = [
      ["modules.tasks.create", { title: "Sneak in" }],
      ["modules.tasks.update", { entityId: "t1", title: "Sneak in" }],
      ["modules.tasks.toggle", { entityId: "t1" }],
      ["modules.tasks.delete", { entityId: "t1" }],
      ["modules.tasks.move", { entityId: "t1", status: "doing", sortOrder: 1 }],
      ["modules.tasks.logTime", { entityId: "t1", minutes: 15 }],
    ];
    for (const [procedure, input] of mutations) {
      const res = await trpcMutation(app, procedure, input);
      expect(res.status).toBe(401);
    }
  });
});

describe("modules.tasks.create", () => {
  test("returns the created task and shows it in the list", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const task = await createTask(testApp.app, cookie, {
      title: "  Ship the quarterly report  ",
      dueDate: "2023-11-20",
      notes: "include the budget figures",
    });

    expect(task.title).toBe("Ship the quarterly report");
    expect(task.status).toBe("todo");
    expect(task.dueDate).toBe("2023-11-20");
    expect(task.notes).toBe("include the budget figures");
    expect(task.completedAt).toBeNull();
    const list = await listTasks(testApp.app, cookie);
    expect(list.tasks.map((item) => item.entityId)).toEqual([task.entityId]);
  });

  test("anchors the spine to home-timezone midnight when a due date is given", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    // A BST date: London midnight is 23:00 UTC the previous day, so a
    // UTC-midnight implementation cannot pass this.
    const task = await createTask(testApp.app, cookie, {
      title: "Summer deadline",
      dueDate: "2023-06-20",
    });

    const entity = readEntityRow(testApp, task.entityId);
    expect(entity?.kind).toBe("task.item");
    expect(entity?.source).toBe("user");
    expect(entity?.occurredStart).toBe(
      startOfDayInZone("2023-06-20", "Europe/London"),
    );
    expect(entity?.occurredStart).toBe(Date.UTC(2023, 5, 19, 23, 0, 0));
    const satellite = readSatelliteRow(testApp, task.entityId);
    expect(satellite).toEqual({
      entityId: task.entityId,
      status: "todo",
      priority: null,
      tags: null,
      dueDate: "2023-06-20",
      completedAt: null,
      notes: null,
      estimateMinutes: null,
      loggedMinutes: 0,
      sortOrder: 1,
    });
  });

  test("stores priority, tags, and estimate and returns them", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const task = await createTask(testApp.app, cookie, {
      title: "Model the runway",
      priority: "high",
      tags: ["finance", " deep work "],
      estimateMinutes: 90,
    });

    expect(task.priority).toBe("high");
    expect(task.tags).toEqual(["finance", "deep work"]);
    expect(task.estimateMinutes).toBe(90);
    expect(task.loggedMinutes).toBe(0);
    const satellite = readSatelliteRow(testApp, task.entityId);
    expect(satellite?.priority).toBe("high");
    expect(satellite?.tags).toBe(JSON.stringify(["finance", "deep work"]));
    expect(satellite?.estimateMinutes).toBe(90);
  });

  test("drops duplicate tags after trimming", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const task = await createTask(testApp.app, cookie, {
      title: "Tag twice",
      tags: ["urgent", " urgent", "later"],
    });

    expect(task.tags).toEqual(["urgent", "later"]);
  });

  test("lands at the end of the todo column, after migrated rows", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const migrated = await createTask(testApp.app, cookie, {
      title: "Migrated survivor",
    });
    // Migration 0006 seeds sort_order from rowid, so pre-board rows can
    // hold any positive position; a new task must never sort before it.
    setSortOrder(testApp, migrated.entityId, 5);

    const fresh = await createTask(testApp.app, cookie, { title: "Fresh" });

    expect(fresh.sortOrder).toBeGreaterThan(5);
    expect(readSatelliteRow(testApp, fresh.entityId)?.sortOrder).toBe(6);
  });

  test("mirrors tags and notes into the search snippet", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const task = await createTask(testApp.app, cookie, {
      title: "Untitled errand",
      tags: ["finance"],
      notes: "quarterly numbers",
    });

    const byTag = searchEntities(testApp.database.sqlite, {
      query: "finance",
    });
    expect(byTag.map((hit) => hit.entityId)).toContain(task.entityId);
    const byNotes = searchEntities(testApp.database.sqlite, {
      query: "quarterly",
    });
    expect(byNotes.map((hit) => hit.entityId)).toContain(task.entityId);
  });

  test("rejects an unknown priority readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.tasks.create",
      { title: "Rank me", priority: "urgent" },
      400,
    );

    expect(message).toBe(
      '"urgent" is not a task priority; expected high, medium, or low.',
    );
  });

  test("rejects a blank tag readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.tasks.create",
      { title: "Tag me", tags: ["ok", "   "] },
      400,
    );

    expect(message).toBe("Tags cannot be empty.");
  });

  test("rejects a 41-character tag readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.tasks.create",
      { title: "Tag me", tags: ["y".repeat(41)] },
      400,
    );

    expect(message).toBe("Tags are limited to 40 characters.");
  });

  test("rejects more than 12 tags readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const tags = Array.from({ length: 13 }, (_, index) => `tag-${index}`);

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.tasks.create",
      { title: "Tag me", tags },
      400,
    );

    expect(message).toBe("A task can have at most 12 tags.");
  });

  test("rejects a negative or fractional estimate readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    for (const estimateMinutes of [-5, 7.5]) {
      const message = await mutationError(
        testApp.app,
        cookie,
        "modules.tasks.create",
        { title: "Size me", estimateMinutes },
        400,
      );
      expect(message).toBe(
        "The estimate must be a whole number of minutes, zero or more.",
      );
    }
  });

  test("stores no spine anchor without a due date", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const task = await createTask(testApp.app, cookie, { title: "Someday" });

    expect(readEntityRow(testApp, task.entityId)?.occurredStart).toBeNull();
    expect(readSatelliteRow(testApp, task.entityId)?.dueDate).toBeNull();
    expect(task.dueDate).toBeNull();
  });

  test("rejects an empty title readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.tasks.create",
      { title: "   " },
      400,
    );

    expect(message).toBe("A task needs a title.");
  });

  test("rejects a 201-character title readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.tasks.create",
      { title: "x".repeat(201) },
      400,
    );

    expect(message).toBe("Task titles are limited to 200 characters.");
  });

  test("rejects an impossible due date readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.tasks.create",
      { title: "Leap of faith", dueDate: "2026-02-31" },
      400,
    );

    expect(message).toBe(
      '"2026-02-31" is not a calendar date; expected YYYY-MM-DD.',
    );
  });

  test("rejects a non-finite estimate readably instead of a raw zod array", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    // NaN/Infinity have no JSON literal, so JSON.stringify(input) would
    // collapse them to null before this ever reaches validation; 1e400
    // is valid JSON text that overflows to Infinity once parsed, so the
    // raw body is built by hand instead of going through JSON.stringify.
    const res = await testApp.app.fetch(
      new Request("http://localhost/api/trpc/modules.tasks.create", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: `{"title":"Overflow me","estimateMinutes":1e400}`,
      }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as TrpcErrorBody;
    expect(json.error.message).toBe(
      "The estimate must be a whole number of minutes, zero or more.",
    );
  });
});

describe("modules.tasks.list", () => {
  test("filters todo, done, and all, defaulting to todo", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const openTask = await createTask(testApp.app, cookie, {
      title: "Still open",
    });
    const doneTask = await createTask(testApp.app, cookie, {
      title: "Already finished",
    });
    await toggleTask(testApp.app, cookie, doneTask.entityId);

    const open = await listTasks(testApp.app, cookie, "todo");
    const done = await listTasks(testApp.app, cookie, "done");
    const all = await listTasks(testApp.app, cookie, "all");
    const fallback = await listTasks(testApp.app, cookie);

    expect(open.tasks.map((item) => item.entityId)).toEqual([
      openTask.entityId,
    ]);
    expect(done.tasks.map((item) => item.entityId)).toEqual([
      doneTask.entityId,
    ]);
    expect(all.tasks.map((item) => item.entityId).toSorted()).toEqual(
      [openTask.entityId, doneTask.entityId].toSorted(),
    );
    expect(fallback.tasks.map((item) => item.entityId)).toEqual([
      openTask.entityId,
    ]);
  });

  test("orders by due date with null due dates last and ties by creation", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const dueFirst = await createTask(testApp.app, cookie, {
      title: "Due earliest",
      dueDate: "2023-11-20",
    });
    // Created later via the API but pinned to an EARLIER created_at, so
    // a creation-order (insertion-order) tie-break cannot pass.
    const tieLate = await createTask(testApp.app, cookie, {
      title: "Tie, created later",
      dueDate: "2023-11-21",
    });
    const tieEarly = await createTask(testApp.app, cookie, {
      title: "Tie, created earlier",
      dueDate: "2023-11-21",
    });
    const noDueLate = await createTask(testApp.app, cookie, {
      title: "No due date, created later",
    });
    const noDueEarly = await createTask(testApp.app, cookie, {
      title: "No due date, created earlier",
    });
    setCreatedAt(testApp, dueFirst.entityId, 100);
    setCreatedAt(testApp, tieLate.entityId, 40);
    setCreatedAt(testApp, tieEarly.entityId, 30);
    setCreatedAt(testApp, noDueLate.entityId, 20);
    setCreatedAt(testApp, noDueEarly.entityId, 10);

    const list = await listTasks(testApp.app, cookie);

    expect(list.tasks.map((item) => item.entityId)).toEqual([
      dueFirst.entityId,
      tieEarly.entityId,
      tieLate.entityId,
      noDueEarly.entityId,
      noDueLate.entityId,
    ]);
  });

  test("filters doing and active, where active excludes only done", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const todoTask = await createTask(testApp.app, cookie, {
      title: "Still todo",
    });
    const doingTask = await createTask(testApp.app, cookie, {
      title: "In progress",
    });
    await moveTask(testApp.app, cookie, {
      entityId: doingTask.entityId,
      status: "doing",
      sortOrder: 1,
    });
    const doneTask = await createTask(testApp.app, cookie, {
      title: "Finished",
    });
    await toggleTask(testApp.app, cookie, doneTask.entityId);

    const doing = await listTasks(testApp.app, cookie, "doing");
    const active = await listTasks(testApp.app, cookie, "active");

    expect(doing.tasks.map((item) => item.entityId)).toEqual([
      doingTask.entityId,
    ]);
    expect(active.tasks.map((item) => item.entityId).toSorted()).toEqual(
      [todoTask.entityId, doingTask.entityId].toSorted(),
    );
  });
});

describe("modules.tasks.board", () => {
  test("groups live tasks into todo, doing, and done, ordered by sort_order then created_at", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const first = await createTask(testApp.app, cookie, { title: "First" });
    const second = await createTask(testApp.app, cookie, { title: "Second" });
    // Give "second" an earlier sort_order than "first" so a correct
    // board query must put it first despite being created later.
    setSortOrder(testApp, second.entityId, 0);
    setSortOrder(testApp, first.entityId, 1);
    const doing = await createTask(testApp.app, cookie, {
      title: "Doing now",
    });
    await moveTask(testApp.app, cookie, {
      entityId: doing.entityId,
      status: "doing",
      sortOrder: 1,
    });
    const done = await createTask(testApp.app, cookie, { title: "Done now" });
    await toggleTask(testApp.app, cookie, done.entityId);

    const board = await readBoard(testApp.app, cookie);

    expect(board.homeTimezone).toBe("Europe/London");
    expect(board.today).toBe("2023-11-14");
    expect(board.columns.todo.map((item) => item.entityId)).toEqual([
      second.entityId,
      first.entityId,
    ]);
    expect(board.columns.doing.map((item) => item.entityId)).toEqual([
      doing.entityId,
    ]);
    expect(board.columns.done.map((item) => item.entityId)).toEqual([
      done.entityId,
    ]);
  });

  test("returns empty columns when there are no tasks", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const board = await readBoard(testApp.app, cookie);

    expect(board.columns).toEqual({ todo: [], doing: [], done: [] });
  });

  test("excludes deleted tasks", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Gone" });
    await deleteTask(testApp.app, cookie, task.entityId);

    const board = await readBoard(testApp.app, cookie);

    expect(board.columns.todo).toHaveLength(0);
  });
});

describe("modules.tasks.move", () => {
  test("todo to doing sets status and sort_order, leaves completed_at null", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Advance" });

    const moved = await moveTask(testApp.app, cookie, {
      entityId: task.entityId,
      status: "doing",
      sortOrder: 2.5,
    });

    expect(moved.status).toBe("doing");
    expect(moved.sortOrder).toBe(2.5);
    expect(moved.completedAt).toBeNull();
    expect(readSatelliteRow(testApp, task.entityId)?.status).toBe("doing");
  });

  test("moving into done sets completed_at from the injected clock", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Finish" });
    testApp.clock.value = 1_700_000_222_000;

    const moved = await moveTask(testApp.app, cookie, {
      entityId: task.entityId,
      status: "done",
      sortOrder: 1,
    });

    expect(moved.status).toBe("done");
    expect(moved.completedAt).toBe(1_700_000_222_000);
  });

  test("moving out of done clears completed_at", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Reopen" });
    await moveTask(testApp.app, cookie, {
      entityId: task.entityId,
      status: "done",
      sortOrder: 1,
    });

    const reopened = await moveTask(testApp.app, cookie, {
      entityId: task.entityId,
      status: "todo",
      sortOrder: 3,
    });

    expect(reopened.status).toBe("todo");
    expect(reopened.completedAt).toBeNull();
    expect(reopened.sortOrder).toBe(3);
  });

  test("repositioning within done keeps the original completed_at", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Settled" });
    testApp.clock.value = 1_700_000_333_000;
    const firstMove = await moveTask(testApp.app, cookie, {
      entityId: task.entityId,
      status: "done",
      sortOrder: 1,
    });
    testApp.clock.value = 1_700_000_444_000;

    const repositioned = await moveTask(testApp.app, cookie, {
      entityId: task.entityId,
      status: "done",
      sortOrder: 4,
    });

    expect(repositioned.completedAt).toBe(firstMove.completedAt);
    expect(repositioned.sortOrder).toBe(4);
  });

  test("bumps the spine updated_at", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Touch" });
    testApp.database.sqlite.run(
      "UPDATE entities SET updated_at = 111 WHERE id = ?",
      [task.entityId],
    );

    await moveTask(testApp.app, cookie, {
      entityId: task.entityId,
      status: "doing",
      sortOrder: 1,
    });

    expect(readEntityRow(testApp, task.entityId)?.updatedAt).toBeGreaterThan(
      111,
    );
  });

  test("rejects an unknown status readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Valid" });

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.tasks.move",
      { entityId: task.entityId, status: "blocked", sortOrder: 1 },
      400,
    );

    expect(message).toBe(
      '"blocked" is not a task status; expected todo, doing, or done.',
    );
  });

  test("rejects a non-finite sort position readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Valid" });

    // NaN/Infinity have no JSON literal, so JSON.stringify(input) would
    // collapse them to null before this ever reaches validation; 1e400
    // is valid JSON text that overflows to Infinity once parsed, so the
    // raw body is built by hand instead of going through JSON.stringify.
    const res = await testApp.app.fetch(
      new Request("http://localhost/api/trpc/modules.tasks.move", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: `{"entityId":"${task.entityId}","status":"doing","sortOrder":1e400}`,
      }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as TrpcErrorBody;
    expect(json.error.message).toBe(
      "The sort position must be a finite number.",
    );
  });
});

describe("modules.tasks.toggle", () => {
  test("todo to done sets completed_at from the server clock and bumps updated_at", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Flip me" });
    testApp.database.sqlite.run(
      "UPDATE entities SET updated_at = 111 WHERE id = ?",
      [task.entityId],
    );
    testApp.clock.value = 1_700_000_111_000;

    const toggled = await toggleTask(testApp.app, cookie, task.entityId);

    expect(toggled.status).toBe("done");
    expect(toggled.completedAt).toBe(1_700_000_111_000);
    expect(readSatelliteRow(testApp, task.entityId)?.completedAt).toBe(
      1_700_000_111_000,
    );
    expect(readEntityRow(testApp, task.entityId)?.updatedAt).toBeGreaterThan(
      111,
    );
  });

  test("done back to todo clears completed_at", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Flip twice" });
    await toggleTask(testApp.app, cookie, task.entityId);

    const reopened = await toggleTask(testApp.app, cookie, task.entityId);

    expect(reopened.status).toBe("todo");
    expect(reopened.completedAt).toBeNull();
    expect(readSatelliteRow(testApp, task.entityId)?.completedAt).toBeNull();
  });

  // The List checkbox has one semantic regardless of board status: it
  // completes the task, and reopening always lands back in todo. "doing"
  // is only reachable again via a fresh board drag, never via the
  // checkbox.
  test("a doing task completes via toggle, and reopening lands in todo, not doing", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Underway" });
    await moveTask(testApp.app, cookie, {
      entityId: task.entityId,
      status: "doing",
      sortOrder: 1,
    });

    const completed = await toggleTask(testApp.app, cookie, task.entityId);
    expect(completed.status).toBe("done");
    expect(completed.completedAt).not.toBeNull();

    const reopened = await toggleTask(testApp.app, cookie, task.entityId);
    expect(reopened.status).toBe("todo");
    expect(reopened.completedAt).toBeNull();
  });
});

describe("modules.tasks.logTime", () => {
  test("adds minutes to a fresh task's logged total", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Draft" });

    const logged = await logTime(testApp.app, cookie, task.entityId, 45);

    expect(logged.loggedMinutes).toBe(45);
    expect(readSatelliteRow(testApp, task.entityId)?.loggedMinutes).toBe(45);
  });

  test("accumulates across repeated calls", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Draft" });

    await logTime(testApp.app, cookie, task.entityId, 30);
    await logTime(testApp.app, cookie, task.entityId, 20);
    const third = await logTime(testApp.app, cookie, task.entityId, 15);

    expect(third.loggedMinutes).toBe(65);
  });

  test("a negative correction subtracts from the total", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Draft" });
    await logTime(testApp.app, cookie, task.entityId, 60);

    const corrected = await logTime(testApp.app, cookie, task.entityId, -25);

    expect(corrected.loggedMinutes).toBe(35);
  });

  test("clamps an over-correction at zero instead of going negative", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Draft" });
    await logTime(testApp.app, cookie, task.entityId, 10);

    const corrected = await logTime(testApp.app, cookie, task.entityId, -100);

    expect(corrected.loggedMinutes).toBe(0);
    expect(readSatelliteRow(testApp, task.entityId)?.loggedMinutes).toBe(0);
  });

  test("rejects zero minutes readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Draft" });

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.tasks.logTime",
      { entityId: task.entityId, minutes: 0 },
      400,
    );

    expect(message).toBe(
      "Logged time must be a non-zero whole number of minutes.",
    );
  });

  test("rejects a fractional minute count readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Draft" });

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.tasks.logTime",
      { entityId: task.entityId, minutes: 12.5 },
      400,
    );

    expect(message).toBe(
      "Logged time must be a non-zero whole number of minutes.",
    );
  });

  test("rejects a non-finite minute count readably instead of a raw zod array", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Draft" });

    // See the sortOrder overflow test above for why this body is built
    // by hand rather than through JSON.stringify.
    const res = await testApp.app.fetch(
      new Request("http://localhost/api/trpc/modules.tasks.logTime", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: `{"entityId":"${task.entityId}","minutes":1e400}`,
      }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as TrpcErrorBody;
    expect(json.error.message).toBe(
      "Logged time must be a non-zero whole number of minutes.",
    );
  });

  test("bumps the spine updated_at", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Touch" });
    testApp.database.sqlite.run(
      "UPDATE entities SET updated_at = 111 WHERE id = ?",
      [task.entityId],
    );

    await logTime(testApp.app, cookie, task.entityId, 15);

    expect(readEntityRow(testApp, task.entityId)?.updatedAt).toBeGreaterThan(
      111,
    );
  });
});

describe("modules.tasks.update", () => {
  test("a title-only update preserves the due date and its spine anchor", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, {
      title: "Old title",
      dueDate: "2023-11-20",
      notes: "keep these notes",
    });

    const res = await trpcMutation(
      testApp.app,
      "modules.tasks.update",
      { entityId: task.entityId, title: "New title" },
      { cookie },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as TrpcSuccess<TaskData>;
    expect(json.result.data.title).toBe("New title");
    expect(json.result.data.dueDate).toBe("2023-11-20");
    expect(json.result.data.notes).toBe("keep these notes");
    const entity = readEntityRow(testApp, task.entityId);
    expect(entity?.title).toBe("New title");
    expect(entity?.occurredStart).toBe(
      startOfDayInZone("2023-11-20", "Europe/London"),
    );
  });

  test("a due date change recomputes the spine anchor", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, {
      title: "Reschedule me",
      dueDate: "2023-11-20",
    });

    const res = await trpcMutation(
      testApp.app,
      "modules.tasks.update",
      { entityId: task.entityId, dueDate: "2023-06-20" },
      { cookie },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as TrpcSuccess<TaskData>;
    expect(json.result.data.dueDate).toBe("2023-06-20");
    expect(readSatelliteRow(testApp, task.entityId)?.dueDate).toBe(
      "2023-06-20",
    );
    // BST again: recomputation must land on London midnight, not UTC's.
    expect(readEntityRow(testApp, task.entityId)?.occurredStart).toBe(
      Date.UTC(2023, 5, 19, 23, 0, 0),
    );
  });

  test("an explicit null due date clears the anchor and the stored date", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, {
      title: "Unschedule me",
      dueDate: "2023-11-20",
    });

    const res = await trpcMutation(
      testApp.app,
      "modules.tasks.update",
      { entityId: task.entityId, dueDate: null },
      { cookie },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as TrpcSuccess<TaskData>;
    expect(json.result.data.dueDate).toBeNull();
    expect(readEntityRow(testApp, task.entityId)?.occurredStart).toBeNull();
    expect(readSatelliteRow(testApp, task.entityId)?.dueDate).toBeNull();
  });

  test("sets and clears priority, tags, and estimate", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Plain" });

    const setRes = await trpcMutation(
      testApp.app,
      "modules.tasks.update",
      {
        entityId: task.entityId,
        priority: "medium",
        tags: ["home"],
        estimateMinutes: 30,
      },
      { cookie },
    );
    expect(setRes.status).toBe(200);
    const set = ((await setRes.json()) as TrpcSuccess<TaskData>).result.data;
    expect(set.priority).toBe("medium");
    expect(set.tags).toEqual(["home"]);
    expect(set.estimateMinutes).toBe(30);

    const clearRes = await trpcMutation(
      testApp.app,
      "modules.tasks.update",
      {
        entityId: task.entityId,
        priority: null,
        tags: [],
        estimateMinutes: null,
      },
      { cookie },
    );
    expect(clearRes.status).toBe(200);
    const cleared = ((await clearRes.json()) as TrpcSuccess<TaskData>).result
      .data;
    expect(cleared.priority).toBeNull();
    expect(cleared.tags).toEqual([]);
    expect(cleared.estimateMinutes).toBeNull();
    const satellite = readSatelliteRow(testApp, task.entityId);
    expect(satellite?.priority).toBeNull();
    expect(satellite?.tags).toBeNull();
    expect(satellite?.estimateMinutes).toBeNull();
  });

  test("recomputes the search snippet when the tags change", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, {
      title: "Retag me",
      tags: ["finance"],
      notes: "quarterly numbers",
    });

    const res = await trpcMutation(
      testApp.app,
      "modules.tasks.update",
      { entityId: task.entityId, tags: ["household"] },
      { cookie },
    );

    expect(res.status).toBe(200);
    const oldTag = searchEntities(testApp.database.sqlite, {
      query: "finance",
    });
    expect(oldTag.map((hit) => hit.entityId)).not.toContain(task.entityId);
    const newTag = searchEntities(testApp.database.sqlite, {
      query: "household",
    });
    expect(newTag.map((hit) => hit.entityId)).toContain(task.entityId);
    // The notes half of the snippet survives a tags-only change.
    const byNotes = searchEntities(testApp.database.sqlite, {
      query: "quarterly",
    });
    expect(byNotes.map((hit) => hit.entityId)).toContain(task.entityId);
  });

  test("keeps tags searchable when only the notes change", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, {
      title: "Annotate me",
      tags: ["finance"],
    });

    const res = await trpcMutation(
      testApp.app,
      "modules.tasks.update",
      { entityId: task.entityId, notes: "fresh commentary" },
      { cookie },
    );

    expect(res.status).toBe(200);
    for (const query of ["finance", "commentary"]) {
      const hits = searchEntities(testApp.database.sqlite, { query });
      expect(hits.map((hit) => hit.entityId)).toContain(task.entityId);
    }
  });

  test("an explicit null clears the notes", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, {
      title: "Tidy me",
      notes: "scratch thoughts",
    });

    const res = await trpcMutation(
      testApp.app,
      "modules.tasks.update",
      { entityId: task.entityId, notes: null },
      { cookie },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as TrpcSuccess<TaskData>;
    expect(json.result.data.notes).toBeNull();
    expect(readSatelliteRow(testApp, task.entityId)?.notes).toBeNull();
  });

  test("rejects an impossible due date readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Valid" });

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.tasks.update",
      { entityId: task.entityId, dueDate: "2026-02-31" },
      400,
    );

    expect(message).toBe(
      '"2026-02-31" is not a calendar date; expected YYYY-MM-DD.',
    );
  });

  test("rejects an empty title readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Valid" });

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.tasks.update",
      { entityId: task.entityId, title: "   " },
      400,
    );

    expect(message).toBe("A task needs a title.");
  });

  test("rejects a 201-character title readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Valid" });

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.tasks.update",
      { entityId: task.entityId, title: "x".repeat(201) },
      400,
    );

    expect(message).toBe("Task titles are limited to 200 characters.");
  });

  test("rejects a non-finite estimate readably instead of a raw zod array", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Valid" });

    // See the move test above for why this body is built by hand rather
    // than through JSON.stringify.
    const res = await testApp.app.fetch(
      new Request("http://localhost/api/trpc/modules.tasks.update", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: `{"entityId":"${task.entityId}","estimateMinutes":1e400}`,
      }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as TrpcErrorBody;
    expect(json.error.message).toBe(
      "The estimate must be a whole number of minutes, zero or more.",
    );
  });

  test("rejects update and toggle on a tombstoned task as not found", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Gone" });
    await deleteTask(testApp.app, cookie, task.entityId);

    const attempts: readonly (readonly [string, unknown])[] = [
      [
        "modules.tasks.update",
        { entityId: task.entityId, title: "Necromancy" },
      ],
      ["modules.tasks.toggle", { entityId: task.entityId }],
      [
        "modules.tasks.move",
        { entityId: task.entityId, status: "doing", sortOrder: 1 },
      ],
      ["modules.tasks.logTime", { entityId: task.entityId, minutes: 15 }],
    ];
    for (const [procedure, input] of attempts) {
      const message = await mutationError(
        testApp.app,
        cookie,
        procedure,
        input,
        404,
      );
      expect(message).toBe(TASK_DELETED_MESSAGE);
    }
  });
});

describe("modules.tasks.delete", () => {
  test("soft-deletes: the spine survives, the satellite stays, list/today/search exclude it", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, {
      title: "Zanzibar expedition",
      dueDate: "2023-11-01",
    });
    const hitsBefore = searchEntities(testApp.database.sqlite, {
      query: "Zanzibar",
    });
    expect(hitsBefore.map((hit) => hit.entityId)).toContain(task.entityId);

    await deleteTask(testApp.app, cookie, task.entityId);

    const entity = readEntityRow(testApp, task.entityId);
    expect(entity).toBeDefined();
    expect(entity?.deletedAt).not.toBeNull();
    expect(readSatelliteRow(testApp, task.entityId)?.status).toBe("todo");
    expect((await listTasks(testApp.app, cookie, "all")).tasks).toHaveLength(0);
    expect((await readToday(testApp.app, cookie)).tasks).toHaveLength(0);
    expect(
      searchEntities(testApp.database.sqlite, { query: "Zanzibar" }),
    ).toHaveLength(0);
  });

  test("a repeat delete is an idempotent no-op", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const task = await createTask(testApp.app, cookie, { title: "Twice" });
    await deleteTask(testApp.app, cookie, task.entityId);
    const deletedAt = readEntityRow(testApp, task.entityId)?.deletedAt;
    expect(deletedAt).not.toBeNull();

    await deleteTask(testApp.app, cookie, task.entityId);

    expect(readEntityRow(testApp, task.entityId)?.deletedAt).toBe(
      deletedAt ?? Number.NaN,
    );
  });
});

describe("modules.tasks.today", () => {
  test("includes overdue and due-today, excludes future, completed, deleted, and undated", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const overdue = await createTask(testApp.app, cookie, {
      title: "Overdue",
      dueDate: "2023-11-10",
    });
    const dueToday = await createTask(testApp.app, cookie, {
      title: "Due today",
      dueDate: "2023-11-14",
    });
    await createTask(testApp.app, cookie, {
      title: "Future",
      dueDate: "2023-11-15",
    });
    const completed = await createTask(testApp.app, cookie, {
      title: "Completed overdue",
      dueDate: "2023-11-01",
    });
    await toggleTask(testApp.app, cookie, completed.entityId);
    const deleted = await createTask(testApp.app, cookie, {
      title: "Deleted overdue",
      dueDate: "2023-11-01",
    });
    await deleteTask(testApp.app, cookie, deleted.entityId);
    await createTask(testApp.app, cookie, { title: "Undated" });

    const today = await readToday(testApp.app, cookie);

    expect(today.homeTimezone).toBe("Europe/London");
    expect(today.today).toBe("2023-11-14");
    expect(today.tasks.map((item) => item.entityId)).toEqual([
      overdue.entityId,
      dueToday.entityId,
    ]);
  });

  test("crosses midnight with the home timezone, not UTC", async () => {
    const testApp = makeTestApp();
    // 23:30 UTC on June 14th is 00:30 BST on the 15th in London: a task
    // due on the 15th is due TODAY there, while UTC still says tomorrow.
    testApp.clock.value = Date.UTC(2023, 5, 14, 23, 30, 0);
    const setupRes = await trpcMutation(testApp.app, "system.setup", {
      password: "correct horse battery",
      homeTimezone: "Europe/London",
    });
    const cookie = sessionCookieFrom(setupRes);
    const dueLocalToday = await createTask(testApp.app, cookie, {
      title: "Due on the local 15th",
      dueDate: "2023-06-15",
    });
    await createTask(testApp.app, cookie, {
      title: "Due on the 16th",
      dueDate: "2023-06-16",
    });

    const today = await readToday(testApp.app, cookie);

    expect(today.today).toBe("2023-06-15");
    expect(today.tasks.map((item) => item.entityId)).toEqual([
      dueLocalToday.entityId,
    ]);
  });
});

describe("the task guard", () => {
  test("rejects a non-task entity readably on update, toggle, and delete", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const store = createEntityStore(testApp.database);
    const { entityId } = store.createUserEntity({
      kind: "note.page",
      schemaVersion: 1,
      title: "A note, not a task",
    });

    const attempts: readonly (readonly [string, unknown])[] = [
      ["modules.tasks.update", { entityId, title: "Hijack" }],
      ["modules.tasks.toggle", { entityId }],
      ["modules.tasks.delete", { entityId }],
      ["modules.tasks.move", { entityId, status: "doing", sortOrder: 1 }],
      ["modules.tasks.logTime", { entityId, minutes: 15 }],
    ];
    for (const [procedure, input] of attempts) {
      const message = await mutationError(
        testApp.app,
        cookie,
        procedure,
        input,
        404,
      );
      expect(message).toBe(NOT_A_TASK_MESSAGE);
    }
  });

  test("rejects a connector-managed entity as forbidden with the store's message", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedConnectorTask(testApp, "synced-task-1");

    const attempts: readonly (readonly [string, unknown])[] = [
      ["modules.tasks.update", { entityId: "synced-task-1", title: "Mine" }],
      ["modules.tasks.toggle", { entityId: "synced-task-1" }],
      ["modules.tasks.delete", { entityId: "synced-task-1" }],
      [
        "modules.tasks.move",
        { entityId: "synced-task-1", status: "doing", sortOrder: 1 },
      ],
      ["modules.tasks.logTime", { entityId: "synced-task-1", minutes: 15 }],
    ];
    for (const [procedure, input] of attempts) {
      const message = await mutationError(
        testApp.app,
        cookie,
        procedure,
        input,
        403,
      );
      expect(message).toBe(CONNECTOR_MANAGED_MESSAGE);
    }
  });
});
