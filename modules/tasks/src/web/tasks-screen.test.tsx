import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { act } from "react";
import type { Task, TaskFilter } from "../contract";
import type { TasksApi } from "./api";
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
    dueDate: "2025-06-30",
  }),
  task({
    entityId: "t-today",
    title: "Water plants",
    dueDate: TODAY,
    notes: "The balcony ones too.",
  }),
  task({ entityId: "t-future", title: "Book dentist", dueDate: "2025-07-10" }),
  task({ entityId: "t-dateless", title: "Sharpen pencils" }),
  task({
    entityId: "t-done",
    title: "File taxes",
    status: "done",
    dueDate: "2025-06-28",
    completedAt: Date.UTC(2025, 5, 28, 12, 0, 0),
  }),
];

interface StubCalls {
  readonly create: { title: string; dueDate?: string }[];
  readonly toggle: string[];
  readonly delete: string[];
}

/** A stateful stub serving list/today like the server would. */
const makeStubApi = (initial: readonly Task[]) => {
  let tasks: readonly Task[] = initial;
  const calls: StubCalls = { create: [], toggle: [], delete: [] };
  const api: TasksApi = {
    list: (filter: TaskFilter) =>
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
    create: (input) => {
      calls.create.push(input);
      const created = task({
        entityId: `t-new-${calls.create.length}`,
        title: input.title,
        dueDate: input.dueDate ?? null,
      });
      tasks = [...tasks, created];
      return Promise.resolve(created);
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
  };
  return { api, calls };
};

/** Mounts the page on a wrapped api, exactly as the registry wires it. */
const renderTasks = (api: TasksApi) => {
  const queryClient = new QueryClient();
  const TasksScreen = createTasksScreen(
    withTasksInvalidation(api, queryClient),
  );
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TasksScreen />
    </QueryClientProvider>,
  );
  return view;
};

const selectTab = (view: ReturnType<typeof render>, name: string): void => {
  const tab = view.getByRole("tab", { name });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
};

test("the Open filter lists open tasks only, with due dates and the notes marker", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const view = renderTasks(api);

  expect(await view.findByText("Chase invoice")).toBeTruthy();
  expect(view.getByText("Water plants")).toBeTruthy();
  expect(view.getByText("Book dentist")).toBeTruthy();
  expect(view.getByText("Sharpen pencils")).toBeTruthy();
  expect(view.queryByText("File taxes")).toBeNull();
  expect(view.getByText("30 Jun")).toBeTruthy();
  expect(view.getByText("10 Jul")).toBeTruthy();
  // Only Water plants carries notes; the marker is display-only.
  expect(view.getAllByText("Has notes").length).toBe(1);
});

test("overdue and due-today open tasks are tinted; future and done ones are not", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const view = renderTasks(api);
  await view.findByText("Chase invoice");

  expect(view.getByText("30 Jun").className).toContain("text-destructive");
  expect(view.getByText("2 Jul").className).toContain("text-destructive");
  expect(view.getByText("10 Jul").className).not.toContain("text-destructive");

  selectTab(view, "Done");
  const doneDate = await view.findByText("28 Jun");
  expect(doneDate.className).not.toContain("text-destructive");
  // A completed title reads muted and struck through.
  expect(view.getByText("File taxes").className).toContain("line-through");
});

test("quick-add creates the task with its due date and shows it after refetch", async () => {
  const { api, calls } = makeStubApi(fixtureTasks);
  const view = renderTasks(api);
  await view.findByText("Chase invoice");

  const title = view.getByPlaceholderText("Add a task...");
  fireEvent.change(title, { target: { value: "Pay rent" } });

  // The DatePicker opens on the real current month (its value starts
  // null); day 15 always falls inside that month's own grid, never on an
  // adjacent month's outside day, so picking it is unambiguous.
  await act(async () => {
    fireEvent.click(view.getByLabelText("Due date"));
  });
  await act(async () => {
    fireEvent.click(view.getByText("15"));
  });
  const now = new Date();
  const pickedDueDate = `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}-15`;

  fireEvent.submit(title);

  expect(await view.findByText("Pay rent")).toBeTruthy();
  expect(calls.create).toEqual([{ title: "Pay rent", dueDate: pickedDueDate }]);
  // The form resets for the next capture.
  expect((title as HTMLInputElement).value).toBe("");
  expect(view.getByLabelText("Due date").textContent).toBe("Due date");
});

test("an empty title gets the readable inline error without calling the api", async () => {
  const { api, calls } = makeStubApi(fixtureTasks);
  const view = renderTasks(api);
  await view.findByText("Chase invoice");

  fireEvent.submit(view.getByPlaceholderText("Add a task..."));

  expect(await view.findByText("A task needs a title.")).toBeTruthy();
  expect(calls.create.length).toBe(0);
});

test("a rejected create surfaces the server's readable message inline", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const failing: TasksApi = {
    ...api,
    create: () =>
      Promise.reject(
        new Error('"2025-99-99" is not a calendar date; expected YYYY-MM-DD.'),
      ),
  };
  const view = renderTasks(failing);
  await view.findByText("Chase invoice");

  fireEvent.change(view.getByPlaceholderText("Add a task..."), {
    target: { value: "Pay rent" },
  });
  fireEvent.submit(view.getByPlaceholderText("Add a task..."));

  expect(
    await view.findByText(
      '"2025-99-99" is not a calendar date; expected YYYY-MM-DD.',
    ),
  ).toBeTruthy();
});

test("toggling moves a task from Open to Done across the filters", async () => {
  const { api, calls } = makeStubApi(fixtureTasks);
  const view = renderTasks(api);
  await view.findByText("Chase invoice");

  // The checkbox's accessible name is the task title. The async act
  // keeps the toggle-invalidate-refetch chain inside React's test scope.
  await act(async () => {
    fireEvent.click(view.getByRole("checkbox", { name: "Chase invoice" }));
  });

  expect(calls.toggle).toEqual(["t-overdue"]);
  // Invalidation refetches the open list, which no longer holds it.
  await view.findByText("Water plants");
  expect(view.queryByText("Chase invoice")).toBeNull();

  selectTab(view, "Done");
  expect(await view.findByText("Chase invoice")).toBeTruthy();
  expect(await view.findByText("File taxes")).toBeTruthy();
});

test("the row's X deletes the task", async () => {
  const { api, calls } = makeStubApi(fixtureTasks);
  const view = renderTasks(api);
  const row = (await view.findByText("Sharpen pencils")).closest("li");
  if (row === null) {
    throw new Error("The task row did not render as a list item.");
  }

  await act(async () => {
    fireEvent.click(within(row).getByRole("button", { name: "Delete task" }));
  });

  expect(calls.delete).toEqual(["t-dateless"]);
  await view.findByText("Chase invoice");
  expect(view.queryByText("Sharpen pencils")).toBeNull();
});

test("each filter has its own empty state", async () => {
  const { api } = makeStubApi([]);
  const view = renderTasks(api);

  expect(await view.findByText("No open tasks.")).toBeTruthy();
  selectTab(view, "Done");
  expect(await view.findByText("No completed tasks.")).toBeTruthy();
  selectTab(view, "All");
  expect(await view.findByText("No tasks yet.")).toBeTruthy();
});

test("shows a readable error when the list cannot load", async () => {
  const { api } = makeStubApi(fixtureTasks);
  const failing: TasksApi = {
    ...api,
    list: () =>
      Promise.reject(new Error("You need to sign in before doing that.")),
  };
  const view = renderTasks(failing);

  expect(
    await view.findByText("You need to sign in before doing that."),
  ).toBeTruthy();
});
