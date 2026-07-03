import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  render,
  within,
} from "@testing-library/react";
import type { Task } from "../contract";
import type { TasksApi, TaskUpdateInput } from "./api";
import { normalizeTasksSearch } from "./helpers/board-search";
import { withTasksInvalidation } from "./queries";
import { createTasksScreen } from "./tasks-screen";
import { registerHappyDom, unregisterHappyDom } from "./test/happy-dom";

beforeAll(() => {
  registerHappyDom();
});
afterEach(cleanup);
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await unregisterHappyDom();
});

const HOME_TZ = "Europe/London";
const TODAY = "2025-07-02";

const task = (seed: Partial<Task> & { entityId: string }): Task => ({
  title: "Untitled",
  status: "todo",
  priority: null,
  tags: [],
  dueDate: null,
  notes: null,
  estimateMinutes: null,
  loggedMinutes: 0,
  sortOrder: 1,
  completedAt: null,
  ...seed,
});

const fixtureTasks: readonly Task[] = [
  task({
    entityId: "t-overdue",
    title: "Chase invoice",
    tags: ["work"],
    priority: "high",
    dueDate: "2025-06-30",
    sortOrder: 1,
  }),
  task({
    entityId: "t-today",
    title: "Water plants",
    dueDate: TODAY,
    notes: "The balcony ones too.",
    sortOrder: 2,
  }),
  task({
    entityId: "t-doing",
    title: "Draft proposal",
    status: "doing",
    tags: ["health"],
    priority: "medium",
    dueDate: "2025-07-10",
    sortOrder: 1,
  }),
];

interface StubCalls {
  readonly create: { title: string; dueDate?: string }[];
  readonly update: TaskUpdateInput[];
  readonly move: { entityId: string; status: string; sortOrder: number }[];
  readonly toggle: string[];
  readonly delete: string[];
  readonly logTime: { entityId: string; minutes: number }[];
}

/** A stateful stub serving list/today/board like the server would. */
const makeStubApi = (initial: readonly Task[]) => {
  let tasks: readonly Task[] = initial;
  const calls: StubCalls = {
    create: [],
    update: [],
    move: [],
    toggle: [],
    delete: [],
    logTime: [],
  };
  const nextSortOrder = (status: Task["status"]): number =>
    Math.max(
      0,
      ...tasks.filter((t) => t.status === status).map((t) => t.sortOrder),
    ) + 1;
  const api: TasksApi = {
    list: (filter) =>
      Promise.resolve({
        tasks:
          filter === "all"
            ? tasks
            : tasks.filter((item) => item.status === filter),
      }),
    today: () =>
      Promise.resolve({
        homeTimezone: HOME_TZ,
        today: TODAY,
        tasks: tasks.filter(
          (item) =>
            item.status !== "done" &&
            item.dueDate !== null &&
            item.dueDate <= TODAY,
        ),
      }),
    board: () =>
      Promise.resolve({
        homeTimezone: HOME_TZ,
        today: TODAY,
        columns: {
          todo: tasks
            .filter((item) => item.status === "todo")
            .toSorted((a, b) => a.sortOrder - b.sortOrder),
          doing: tasks
            .filter((item) => item.status === "doing")
            .toSorted((a, b) => a.sortOrder - b.sortOrder),
          done: tasks
            .filter((item) => item.status === "done")
            .toSorted((a, b) => a.sortOrder - b.sortOrder),
        },
      }),
    create: (input) => {
      calls.create.push(input);
      const created = task({
        entityId: `t-new-${calls.create.length}`,
        title: input.title,
        dueDate: input.dueDate ?? null,
        sortOrder: nextSortOrder("todo"),
      });
      tasks = [...tasks, created];
      return Promise.resolve(created);
    },
    update: (input) => {
      calls.update.push(input);
      tasks = tasks.map((item) =>
        item.entityId === input.entityId
          ? task({
              ...item,
              ...(input.title === undefined ? {} : { title: input.title }),
              ...(input.dueDate === undefined
                ? {}
                : { dueDate: input.dueDate }),
              ...(input.notes === undefined ? {} : { notes: input.notes }),
              ...(input.priority === undefined
                ? {}
                : { priority: input.priority }),
              ...(input.tags === undefined ? {} : { tags: input.tags }),
              ...(input.estimateMinutes === undefined
                ? {}
                : { estimateMinutes: input.estimateMinutes }),
            })
          : item,
      );
      const updated = tasks.find((item) => item.entityId === input.entityId);
      if (updated === undefined) {
        return Promise.reject(new Error("This item is not a task."));
      }
      return Promise.resolve(updated);
    },
    move: (input) => {
      calls.move.push(input);
      tasks = tasks.map((item) =>
        item.entityId === input.entityId
          ? task({ ...item, status: input.status, sortOrder: input.sortOrder })
          : item,
      );
      const moved = tasks.find((item) => item.entityId === input.entityId);
      if (moved === undefined) {
        return Promise.reject(new Error("This item is not a task."));
      }
      return Promise.resolve(moved);
    },
    toggle: (entityId) => {
      calls.toggle.push(entityId);
      tasks = tasks.map((item) =>
        item.entityId === entityId
          ? task({
              ...item,
              status: item.status === "done" ? "todo" : "done",
            })
          : item,
      );
      const toggled = tasks.find((item) => item.entityId === entityId);
      if (toggled === undefined) {
        return Promise.reject(new Error("This item is not a task."));
      }
      return Promise.resolve(toggled);
    },
    delete: (entityId) => {
      calls.delete.push(entityId);
      tasks = tasks.filter((item) => item.entityId !== entityId);
      return Promise.resolve({ entityId });
    },
    logTime: (input) => {
      calls.logTime.push(input);
      tasks = tasks.map((item) =>
        item.entityId === input.entityId
          ? task({
              ...item,
              loggedMinutes: Math.max(0, item.loggedMinutes + input.minutes),
            })
          : item,
      );
      const logged = tasks.find((item) => item.entityId === input.entityId);
      if (logged === undefined) {
        return Promise.reject(new Error("This item is not a task."));
      }
      return Promise.resolve(logged);
    },
  };
  return { api, calls };
};

/** Mounts the page on a router, exactly as the module page contribution wires it. */
const renderTasks = async (api: TasksApi, url = "/tasks") => {
  const queryClient = new QueryClient();
  const rootRoute = createRootRoute();
  const tasksRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tasks",
    validateSearch: normalizeTasksSearch,
    component: createTasksScreen(withTasksInvalidation(api, queryClient)),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([tasksRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  // Settling the router before mounting keeps its internal post-render
  // state updates out of React's act() warnings (calendar-screen.test.tsx
  // pattern).
  await router.load();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { view, router };
};

const searchOf = (router: { state: { location: { search: unknown } } }) =>
  normalizeTasksSearch(router.state.location.search);

// Switching the tab fires an async router navigation, so its re-render
// (mounting/unmounting the board's DndContext and the list's checkboxes)
// lands outside the sync act window fireEvent opens; awaiting an async
// act flushes that navigation and keeps the output free of act warnings.
const selectTab = async (
  view: ReturnType<typeof render>,
  name: string,
): Promise<void> => {
  const tab = view.getByRole("tab", { name });
  await act(async () => {
    fireEvent.mouseDown(tab, { button: 0 });
    fireEvent.click(tab);
  });
};

test("the board is the default view, with three columns and their counts", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api);

  expect(await view.findByText("Chase invoice")).toBeTruthy();
  expect(view.getByText("Water plants")).toBeTruthy();
  expect(view.getByText("Draft proposal")).toBeTruthy();
  const boardTab = view.getByRole("tab", { name: "Board" });
  expect(boardTab.getAttribute("aria-selected")).toBe("true");
  // To do (2), Doing (1), Done (0): each column's own count badge.
  expect(view.getByText("2")).toBeTruthy();
  expect(view.getAllByText("1").length).toBeGreaterThan(0);
  expect(view.getByText("0")).toBeTruthy();
});

test("a card shows its tag, priority, and overdue due date", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api);
  await view.findByText("Chase invoice");

  expect(view.getByText("work")).toBeTruthy();
  expect(view.getByText("High")).toBeTruthy();
  expect(view.getByText("30 Jun").className).toContain("text-destructive");
});

test("a card shows only the estimate when nothing is logged yet", async () => {
  const { api } = makeStubApi([
    task({ entityId: "t-est", title: "Plan sprint", estimateMinutes: 60 }),
  ]);
  const { view } = await renderTasks(api);

  await view.findByText("Plan sprint");
  expect(view.getByText("Est 1h")).toBeTruthy();
});

test("a card shows only the logged time when there is no estimate", async () => {
  const { api } = makeStubApi([
    task({ entityId: "t-log", title: "Fix bug", loggedMinutes: 85 }),
  ]);
  const { view } = await renderTasks(api);

  await view.findByText("Fix bug");
  expect(view.getByText("Logged 1h 25m")).toBeTruthy();
});

test("a card shows both estimate and logged time together", async () => {
  const { api } = makeStubApi([
    task({
      entityId: "t-both",
      title: "Write report",
      estimateMinutes: 180,
      loggedMinutes: 170,
    }),
  ]);
  const { view } = await renderTasks(api);

  await view.findByText("Write report");
  expect(view.getByText("Est 3h · Logged 2h 50m")).toBeTruthy();
});

test("logging past the estimate tints the logged half instead of the whole line", async () => {
  const { api } = makeStubApi([
    task({
      entityId: "t-over",
      title: "Over budget",
      estimateMinutes: 30,
      loggedMinutes: 45,
    }),
  ]);
  const { view } = await renderTasks(api);

  await view.findByText("Over budget");
  const footer = view.getByText("Est 30m", { exact: false });
  expect(footer.textContent).toBe("Est 30m · Logged 45m");
  const logged = view.getByText("Logged 45m");
  expect(logged.className).toContain("text-amber-600");
});

test("a card shows no time footer when neither estimate nor logged time is set", async () => {
  const { api } = makeStubApi([
    task({ entityId: "t-plain", title: "Plain task" }),
  ]);
  const { view } = await renderTasks(api);

  await view.findByText("Plain task");
  expect(view.queryByText(/Est /)).toBeNull();
  expect(view.queryByText(/Logged /)).toBeNull();
});

test("an empty column shows the quiet empty state", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api);

  expect(await view.findByText("Nothing here.")).toBeTruthy();
});

test("a card is wired into dnd-kit as a real sortable item", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api);
  const title = await view.findByText("Chase invoice");

  const card = title.closest('[aria-roledescription="sortable"]');
  expect(card).not.toBeNull();
  expect(card?.getAttribute("tabindex")).toBe("0");
});

test("the switcher moves to the list view and writes it into the URL", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const { view, router } = await renderTasks(api);
  await view.findByText("Chase invoice");

  await selectTab(view, "List");

  expect(await view.findByPlaceholderText("Add a task...")).toBeTruthy();
  expect(searchOf(router)).toEqual({ view: "list" });
  expect(view.getByRole("tab", { name: "Open" })).toBeTruthy();
});

test("a list URL renders the list view directly, and switching back restores the board", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const { view, router } = await renderTasks(api, "/tasks?view=list");

  expect(await view.findByPlaceholderText("Add a task...")).toBeTruthy();

  await selectTab(view, "Board");

  expect(await view.findByText("Chase invoice")).toBeTruthy();
  expect(searchOf(router)).toEqual({ view: "board" });
});

test("a garbage ?view= falls back to the board", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api, "/tasks?view=gantt");

  expect(await view.findByText("Chase invoice")).toBeTruthy();
});

test("clicking a card opens the detail sheet without dragging", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api);
  const title = await view.findByText("Water plants");

  fireEvent.click(title);

  expect(await view.findByText("Edit task")).toBeTruthy();
  expect(view.getByLabelText("Title")).toHaveProperty("value", "Water plants");
  expect(view.getByLabelText("Notes")).toHaveProperty(
    "value",
    "The balcony ones too.",
  );
});

test("the card's Edit button opens the detail sheet (keyboard/SR path)", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api);
  await view.findByText("Water plants");

  // The card's own Space/Enter drive the dnd keyboard sensor, so this
  // explicit button is how keyboard and screen-reader users reach the
  // editor. Activating it (what Enter/Space on the focused button do)
  // opens the sheet.
  fireEvent.click(view.getByRole("button", { name: "Edit Water plants" }));

  expect(await view.findByText("Edit task")).toBeTruthy();
  expect(view.getByLabelText("Title")).toHaveProperty("value", "Water plants");
});

test("the list row's Edit button opens the detail sheet", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api, "/tasks?view=list");
  await view.findByText("Chase invoice");

  fireEvent.click(view.getByRole("button", { name: "Edit Chase invoice" }));

  expect(await view.findByText("Edit task")).toBeTruthy();
  expect(view.getByLabelText("Title")).toHaveProperty("value", "Chase invoice");
});

test("saving a priority change calls update with the task's priority", async () => {
  const { api, calls } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api);
  const card = await view.findByText("Water plants");
  act(() => {
    fireEvent.click(card);
  });
  await view.findByText("Edit task");

  fireEvent.click(view.getByRole("radio", { name: "High" }));
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Save" }));
  });

  expect(calls.update).toHaveLength(1);
  expect(calls.update[0]).toMatchObject({
    entityId: "t-today",
    priority: "high",
  });
  expect(view.queryByText("Edit task")).toBeNull();
});

test("adding a tag in the sheet saves it in the tags list", async () => {
  const { api, calls } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api);
  const card = await view.findByText("Water plants");
  act(() => {
    fireEvent.click(card);
  });
  await view.findByText("Edit task");

  fireEvent.change(view.getByLabelText("Add tag"), {
    target: { value: "garden" },
  });
  fireEvent.click(view.getByRole("button", { name: "Add" }));
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Save" }));
  });

  expect(calls.update[0]).toMatchObject({
    entityId: "t-today",
    tags: ["garden"],
  });
});

test("setting the estimate in the sheet saves it as whole minutes", async () => {
  const { api, calls } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api);
  const card = await view.findByText("Water plants");
  act(() => {
    fireEvent.click(card);
  });
  await view.findByText("Edit task");

  fireEvent.change(view.getByLabelText("Estimate (minutes)"), {
    target: { value: "45" },
  });
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Save" }));
  });

  expect(calls.update[0]).toMatchObject({
    entityId: "t-today",
    estimateMinutes: 45,
  });
});

test("the sheet shows the running logged total and a log-time control adds to it", async () => {
  const { api, calls } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api);
  const card = await view.findByText("Water plants");
  act(() => {
    fireEvent.click(card);
  });
  await view.findByText("Edit task");
  // Scoped to the dialog: once logged, the board card grows its own
  // matching time footer too, so an unscoped query becomes ambiguous.
  const dialog = within(view.getByRole("dialog"));
  expect(dialog.getByText("Logged 0m")).toBeTruthy();

  fireEvent.change(view.getByLabelText("Minutes to log"), {
    target: { value: "50" },
  });
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Log time" }));
  });

  expect(calls.logTime).toEqual([{ entityId: "t-today", minutes: 50 }]);
  expect(await dialog.findByText("Logged 50m")).toBeTruthy();
  // Unlike Save/Delete, logging time keeps the sheet open.
  expect(view.getByText("Edit task")).toBeTruthy();
});

test("a quick +15m button logs a fixed increment", async () => {
  const { api, calls } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api);
  const card = await view.findByText("Water plants");
  act(() => {
    fireEvent.click(card);
  });
  await view.findByText("Edit task");
  const dialog = within(view.getByRole("dialog"));

  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "+15m" }));
  });

  expect(calls.logTime).toEqual([{ entityId: "t-today", minutes: 15 }]);
  expect(await dialog.findByText("Logged 15m")).toBeTruthy();
});

test("logging zero minutes is rejected readably without calling the api", async () => {
  const { api, calls } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api);
  const card = await view.findByText("Water plants");
  act(() => {
    fireEvent.click(card);
  });
  await view.findByText("Edit task");

  fireEvent.change(view.getByLabelText("Minutes to log"), {
    target: { value: "0" },
  });
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Log time" }));
  });

  expect(calls.logTime).toEqual([]);
  expect(
    await view.findByText("Enter a non-zero whole number of minutes."),
  ).toBeTruthy();
});

test("a failed log-time surfaces a readable error and keeps the sheet open", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const failing: TasksApi = {
    ...api,
    logTime: () =>
      Promise.reject(new Error("You need to sign in before doing that.")),
  };
  const { view } = await renderTasks(failing);
  const card = await view.findByText("Water plants");
  act(() => {
    fireEvent.click(card);
  });
  await view.findByText("Edit task");

  fireEvent.change(view.getByLabelText("Minutes to log"), {
    target: { value: "30" },
  });
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Log time" }));
  });

  expect(
    await view.findByText("You need to sign in before doing that."),
  ).toBeTruthy();
  expect(view.getByText("Edit task")).toBeTruthy();
});

test("picking a due date in the sheet saves it", async () => {
  const { api, calls } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api);
  const card = await view.findByText("Chase invoice");
  act(() => {
    fireEvent.click(card);
  });
  await view.findByText("Edit task");
  // The board's own To do quick-add also has a "Due date" picker behind
  // the sheet, so the query is scoped to the dialog to disambiguate.
  const dialog = within(view.getByRole("dialog"));

  await act(async () => {
    fireEvent.click(dialog.getByLabelText("Due date"));
  });
  // "Chase invoice" already has a due date, so the calendar opens on
  // that date's own month (2025-06) rather than the real current one.
  await act(async () => {
    fireEvent.click(view.getByText("15"));
  });

  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Save" }));
  });

  expect(calls.update[0]).toMatchObject({
    entityId: "t-overdue",
    dueDate: "2025-06-15",
  });
});

test("deleting from the sheet calls delete and closes", async () => {
  const { api, calls } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api);
  const card = await view.findByText("Water plants");
  act(() => {
    fireEvent.click(card);
  });
  await view.findByText("Edit task");

  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Delete" }));
  });

  expect(calls.delete).toEqual(["t-today"]);
  expect(view.queryByText("Edit task")).toBeNull();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(view.queryByText("Water plants")).toBeNull();
});

test("a failed delete surfaces a readable error instead of closing", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const failing: TasksApi = {
    ...api,
    delete: () =>
      Promise.reject(new Error("You need to sign in before doing that.")),
  };
  const { view } = await renderTasks(failing);
  const card = await view.findByText("Water plants");
  act(() => {
    fireEvent.click(card);
  });
  await view.findByText("Edit task");

  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Delete" }));
  });

  // The sheet stays open with the server's readable message.
  expect(
    await view.findByText("You need to sign in before doing that."),
  ).toBeTruthy();
  expect(view.getByText("Edit task")).toBeTruthy();
});

test("the list view still lists open (todo) tasks by due date, with notes markers", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api, "/tasks?view=list");

  // The Open filter is "todo" only; "Draft proposal" is "doing" and
  // surfaces under All instead (checked below).
  expect(await view.findByText("Chase invoice")).toBeTruthy();
  expect(view.getByText("Water plants")).toBeTruthy();
  expect(view.getByText("30 Jun")).toBeTruthy();
  expect(view.getAllByText("Has notes").length).toBe(1);

  await selectTab(view, "All");
  expect(await view.findByText("Draft proposal")).toBeTruthy();
});

test("the list view's quick-add still creates a task", async () => {
  const { api, calls } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api, "/tasks?view=list");
  await view.findByText("Chase invoice");

  fireEvent.change(view.getByPlaceholderText("Add a task..."), {
    target: { value: "Pay rent" },
  });
  fireEvent.submit(view.getByPlaceholderText("Add a task..."));

  expect(await view.findByText("Pay rent")).toBeTruthy();
  expect(calls.create).toEqual([{ title: "Pay rent" }]);
});

test("toggling in the list view moves a task from Open to Done", async () => {
  const { api, calls } = makeStubApi(fixtureTasks);
  const { view } = await renderTasks(api, "/tasks?view=list");
  await view.findByText("Chase invoice");

  await act(async () => {
    fireEvent.click(view.getByRole("checkbox", { name: "Chase invoice" }));
  });

  expect(calls.toggle).toEqual(["t-overdue"]);
  await view.findByText("Water plants");
  expect(view.queryByText("Chase invoice")).toBeNull();

  await selectTab(view, "Done");
  expect(await view.findByText("Chase invoice")).toBeTruthy();
});

test("shows a readable error when the board cannot load", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const failing: TasksApi = {
    ...api,
    board: () =>
      Promise.reject(new Error("You need to sign in before doing that.")),
  };
  const { view } = await renderTasks(failing);

  expect(
    await view.findByText("You need to sign in before doing that."),
  ).toBeTruthy();
});
