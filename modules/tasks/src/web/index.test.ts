import { describe, expect, test } from "bun:test";
import { TASK_ITEM_KIND } from "@halero/schemas";
import type { TasksApi } from "./api";
import { createTasksWebModule } from "./index";

const stubApi: TasksApi = {
  list: () => Promise.resolve({ tasks: [] }),
  today: () =>
    Promise.resolve({ homeTimezone: "UTC", today: "2025-07-02", tasks: [] }),
  board: () =>
    Promise.resolve({
      homeTimezone: "UTC",
      today: "2025-07-02",
      columns: { todo: [], doing: [], done: [] },
    }),
  create: () => Promise.reject(new Error("not under test")),
  update: () => Promise.reject(new Error("not under test")),
  move: () => Promise.reject(new Error("not under test")),
  toggle: () => Promise.reject(new Error("not under test")),
  delete: () => Promise.reject(new Error("not under test")),
  logTime: () => Promise.reject(new Error("not under test")),
};

describe("the tasks web module", () => {
  const module = createTasksWebModule(stubApi);

  test("contributes the Tasks nav entry between Calendar and Settings", () => {
    expect(module.nav).toEqual([
      { label: "Tasks", path: "/tasks", order: 30, icon: "tasks" },
    ]);
  });

  test("contributes the /tasks page", () => {
    expect(module.pages?.map((page) => page.path)).toEqual(["/tasks"]);
  });

  test("contributes the quick-capture palette command", () => {
    expect(module.commands?.map((command) => command.id)).toEqual([
      "tasks.new",
    ]);
  });

  test("links task items to the tasks page under the Task heading", () => {
    const link = module.entityLinks?.[0];
    expect(link?.kind).toBe(TASK_ITEM_KIND);
    expect(link?.label).toBe("Task");
    expect(link?.buildLink({ entityId: "t-1", occurredDate: null })).toEqual({
      path: "/tasks",
    });
    // Dated hits land on the same page: the list already carries dates.
    expect(
      link?.buildLink({ entityId: "t-2", occurredDate: "2025-07-02" }),
    ).toEqual({ path: "/tasks" });
  });
});
