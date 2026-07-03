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
  readonly dueDate: string | null;
  readonly notes: string | null;
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

interface TrpcErrorBody {
  readonly error: { readonly message: string };
}

interface CreateTaskInput {
  readonly title: string;
  readonly dueDate?: string;
  readonly notes?: string;
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
  filter?: "todo" | "done" | "all",
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

    for (const procedure of ["modules.tasks.list", "modules.tasks.today"]) {
      const res = await trpcQuery(app, procedure);
      expect(res.status).toBe(401);
    }
    const mutations: readonly (readonly [string, unknown])[] = [
      ["modules.tasks.create", { title: "Sneak in" }],
      ["modules.tasks.update", { entityId: "t1", title: "Sneak in" }],
      ["modules.tasks.toggle", { entityId: "t1" }],
      ["modules.tasks.delete", { entityId: "t1" }],
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
      sortOrder: 0,
    });
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
