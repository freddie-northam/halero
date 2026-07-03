import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { act } from "react";
import type { Task } from "../contract";
import type { TasksApi } from "./api";
import { withTasksInvalidation } from "./queries";
import { registerHappyDom, unregisterHappyDom } from "./test/happy-dom";
import { createTasksTodaySection } from "./today-due-section";

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
  status: "open",
  dueDate: TODAY,
  notes: null,
  completedAt: null,
  ...seed,
});

/** Serves the today view like the server: open, due today or overdue. */
const makeStubApi = (initial: readonly Task[]) => {
  let tasks: readonly Task[] = initial;
  const calls: string[] = [];
  const api: TasksApi = {
    list: () => Promise.resolve({ tasks }),
    today: () =>
      Promise.resolve({
        homeTimezone: HOME_TZ,
        today: TODAY,
        tasks: tasks.filter((item) => item.status === "open"),
      }),
    create: () => Promise.reject(new Error("not under test")),
    toggle: (entityId) => {
      calls.push(entityId);
      tasks = tasks.map((item) =>
        item.entityId === entityId ? task({ ...item, status: "done" }) : item,
      );
      const toggled = tasks.find((item) => item.entityId === entityId);
      if (toggled === undefined) {
        return Promise.reject(new Error("This item is not a task."));
      }
      return Promise.resolve(toggled);
    },
    delete: () => Promise.reject(new Error("not under test")),
  };
  return { api, calls };
};

const renderSection = async (api: TasksApi) => {
  const queryClient = new QueryClient();
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: createTasksTodaySection(withTasksInvalidation(api, queryClient)),
  });
  // The "View all tasks" link resolves against this.
  const tasksRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tasks",
    component: (): ReactElement => <p>Tasks page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, tasksRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

test("lists the open tasks due today or overdue under the Due today heading", async () => {
  const { api } = makeStubApi([
    task({
      entityId: "t-overdue",
      title: "Chase invoice",
      dueDate: "2025-06-30",
    }),
    task({ entityId: "t-today", title: "Water plants" }),
  ]);
  const view = await renderSection(api);

  expect(await view.findByText("Due today")).toBeTruthy();
  expect(await view.findByText("Chase invoice")).toBeTruthy();
  expect(view.getByText("Water plants")).toBeTruthy();
  // The overdue row carries its date so the slip is visible.
  expect(view.getByText("30 Jun").className).toContain("text-destructive");
});

test("toggling completes the task and drops it from the section", async () => {
  const { api, calls } = makeStubApi([
    task({ entityId: "t-today", title: "Water plants" }),
    task({
      entityId: "t-overdue",
      title: "Chase invoice",
      dueDate: "2025-06-30",
    }),
  ]);
  const view = await renderSection(api);
  await view.findByText("Water plants");

  // The async act keeps the toggle-invalidate-refetch chain inside
  // React's test scope.
  await act(async () => {
    fireEvent.click(view.getByRole("checkbox", { name: "Water plants" }));
  });

  expect(calls).toEqual(["t-today"]);
  await view.findByText("Chase invoice");
  expect(view.queryByText("Water plants")).toBeNull();
});

test("offers the View all tasks link to the tasks page", async () => {
  const { api } = makeStubApi([]);
  const view = await renderSection(api);

  const link = await view.findByRole("link", { name: "View all tasks" });
  expect(link.getAttribute("href")).toBe("/tasks");
});

test("shows the quiet empty line when nothing is due", async () => {
  const { api } = makeStubApi([]);
  const view = await renderSection(api);

  expect(await view.findByText("Nothing due today.")).toBeTruthy();
});

test("shows a readable error when the due tasks cannot load", async () => {
  const { api } = makeStubApi([]);
  const failing: TasksApi = {
    ...api,
    today: () =>
      Promise.reject(new Error("You need to sign in before doing that.")),
  };
  const view = await renderSection(failing);

  expect(
    await view.findByText("You need to sign in before doing that."),
  ).toBeTruthy();
});
