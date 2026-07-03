import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type { Task } from "../contract";
import type { TasksApi } from "./api";
import { withTasksInvalidation } from "./queries";

const task: Task = {
  entityId: "t-1",
  title: "Buy milk",
  status: "open",
  dueDate: null,
  notes: null,
  completedAt: null,
};

const makeStub = () => {
  const calls: string[] = [];
  const api: TasksApi = {
    list: () => {
      calls.push("list");
      return Promise.resolve({ tasks: [task] });
    },
    today: () => {
      calls.push("today");
      return Promise.resolve({
        homeTimezone: "UTC",
        today: "2025-07-02",
        tasks: [],
      });
    },
    create: () => {
      calls.push("create");
      return Promise.resolve(task);
    },
    toggle: () => {
      calls.push("toggle");
      return Promise.resolve(task);
    },
    delete: () => {
      calls.push("delete");
      return Promise.resolve({ entityId: task.entityId });
    },
  };
  return { api, calls };
};

const makeSpyClient = () => {
  const queryClient = new QueryClient();
  let invalidations = 0;
  const original = queryClient.invalidateQueries.bind(queryClient);
  queryClient.invalidateQueries = ((...args: []) => {
    invalidations += 1;
    return original(...args);
  }) as QueryClient["invalidateQueries"];
  return { queryClient, invalidated: () => invalidations };
};

describe("withTasksInvalidation", () => {
  test("invalidates the tasks queries after each mutation", async () => {
    const { api } = makeStub();
    const { queryClient, invalidated } = makeSpyClient();
    const wrapped = withTasksInvalidation(api, queryClient);

    await wrapped.create({ title: "Buy milk" });
    expect(invalidated()).toBe(1);
    await wrapped.toggle("t-1");
    expect(invalidated()).toBe(2);
    await wrapped.delete("t-1");
    expect(invalidated()).toBe(3);
  });

  test("passes reads through without touching the cache", async () => {
    const { api, calls } = makeStub();
    const { queryClient, invalidated } = makeSpyClient();
    const wrapped = withTasksInvalidation(api, queryClient);

    await wrapped.list("open");
    await wrapped.today();
    expect(calls).toEqual(["list", "today"]);
    expect(invalidated()).toBe(0);
  });

  test("returns the underlying results and skips invalidation on failure", async () => {
    const { queryClient, invalidated } = makeSpyClient();
    const failing: TasksApi = {
      ...makeStub().api,
      create: () => Promise.reject(new Error("A task needs a title.")),
    };
    const wrapped = withTasksInvalidation(failing, queryClient);

    expect(wrapped.create({ title: "" })).rejects.toThrow(
      "A task needs a title.",
    );
    const created = await wrapped.toggle("t-1");
    expect(created.entityId).toBe("t-1");
    expect(invalidated()).toBe(1);
  });
});
