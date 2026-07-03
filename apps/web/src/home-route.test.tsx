import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { CalendarApi } from "@halero/module-calendar/web";
import type { Task, TasksApi } from "@halero/module-tasks/web";
import {
  createTodayWebModule,
  type TodayApi,
  type TodaySection,
} from "@halero/module-today/web";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import {
  cleanup,
  type RenderResult,
  render,
  within,
} from "@testing-library/react";
import { act } from "react";
import type { GoogleStatus, HaleroApi } from "./lib/api";
import { ApiProvider } from "./lib/api-context";
import type { TrpcClient } from "./lib/trpc";
import { buildTodaySections, buildWebModules } from "./registry";
import { createAppRouter } from "./router";
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

const standup = {
  entityId: "ev-standup",
  title: "Standup",
  allDay: false,
  start: Date.UTC(2025, 6, 2, 8, 30, 0),
  end: Date.UTC(2025, 6, 2, 8, 45, 0),
  location: null,
  calendarId: "primary",
  recurring: false,
};

const dueTask: Task = {
  entityId: "t-1",
  title: "Pay invoices",
  status: "todo",
  priority: null,
  tags: [],
  dueDate: TODAY,
  notes: null,
  estimateMinutes: null,
  loggedMinutes: 0,
  sortOrder: 1,
  completedAt: null,
};

// The module registry wires its seams straight from the tRPC client, so
// the wiring test stubs the calendar and tasks procedures the home
// page's sections reach.
const stubClient = {
  modules: {
    calendar: {
      today: {
        query: () => Promise.resolve({ homeTimezone: HOME_TZ, today: TODAY }),
      },
      range: {
        query: ({ from }: { from: string }) =>
          Promise.resolve({
            homeTimezone: HOME_TZ,
            days: from === TODAY ? [{ date: TODAY, events: [standup] }] : [],
          }),
      },
    },
    tasks: {
      list: { query: () => Promise.resolve({ tasks: [dueTask] }) },
      today: {
        query: () =>
          Promise.resolve({
            homeTimezone: HOME_TZ,
            today: TODAY,
            tasks: [dueTask],
          }),
      },
      create: { mutate: () => Promise.reject(new Error("not under test")) },
      toggle: { mutate: () => Promise.reject(new Error("not under test")) },
      delete: { mutate: () => Promise.reject(new Error("not under test")) },
    },
  },
} as unknown as TrpcClient;

const googleStatus: GoogleStatus = {
  clientConfigured: true,
  httpsOk: true,
  redirectUri: "https://halero.example.com/api/oauth/google/callback",
  connection: null,
};

const stubApi = (overrides: Partial<HaleroApi> = {}): HaleroApi => ({
  systemStatus: () =>
    Promise.resolve({ needsSetup: false, authenticated: true }),
  setup: () => Promise.resolve(),
  login: () => Promise.resolve(),
  logout: () => Promise.resolve(),
  googleStatus: () => Promise.resolve(googleStatus),
  saveGoogleClient: () => Promise.resolve(),
  syncGoogleNow: () =>
    Promise.resolve({ status: "success", upserts: 0, deletes: 0, error: null }),
  notificationSettings: () => Promise.resolve({ url: null }),
  saveNotifyUrl: () => Promise.resolve(),
  sendTestNotification: () => Promise.resolve({ delivered: true }),
  baseUrl: () => Promise.resolve({ url: "http://localhost:4253/" }),
  saveBaseUrl: () => Promise.resolve(),
  listApiTokens: () => Promise.resolve([]),
  createApiToken: (name: string) =>
    Promise.resolve({ id: "tok-1", name, token: `halero_${"a".repeat(64)}` }),
  revokeApiToken: () => Promise.resolve(),
  search: () => Promise.resolve([]),
  ...overrides,
});

const renderApp = async (path: string): Promise<RenderResult> => {
  const api = stubApi();
  // The same QueryClient goes to the registry (for invalidation wiring)
  // and the provider, exactly as main.tsx wires the real app.
  const queryClient = new QueryClient();
  const router = createAppRouter(
    api,
    buildWebModules(stubClient, api, queryClient),
    createMemoryHistory({ initialEntries: [path] }),
  );
  await router.load();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        <RouterProvider router={router} />
      </ApiProvider>
    </QueryClientProvider>,
  );
  // Settle the sections' stubbed query chains inside act, so late
  // mounts (the due-today checkboxes) never land between act windows.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
};

test("the index route serves the Today page with the agenda from the stub", async () => {
  const view = await renderApp("/");

  expect(
    await view.findByText(/Good (morning|afternoon|evening)/),
  ).toBeTruthy();
  // The comma after the weekday is ICU-version-dependent in en-GB long
  // dates (present on some runtimes, absent on others), so match it
  // optionally rather than pinning one runtime's ICU output.
  expect(await view.findByText(/^Wednesday,? 2 July 2025$/)).toBeTruthy();
  // The calendar and tasks sections' rows come through the
  // registry-wired seams.
  expect(await view.findByText("Standup")).toBeTruthy();
  expect(await view.findByText("Pay invoices")).toBeTruthy();
  expect(view.queryByText("Nothing here yet.")).toBeNull();
});

test("the sidebar marks Today active on the home route only", async () => {
  const view = await renderApp("/");
  await view.findByText(/Good (morning|afternoon|evening)/);

  const nav = within(view.getByRole("navigation", { name: "Primary" }));
  const today = nav.getByRole("button", { name: "Today" });
  const calendar = nav.getByRole("button", { name: "Calendar" });
  expect(today.getAttribute("aria-current")).toBe("page");
  expect(calendar.getAttribute("aria-current")).toBeNull();
});

test("Today goes inactive on /calendar: '/' must exact-match, not prefix-match", async () => {
  const view = await renderApp("/calendar");
  await view.findByRole("tab", { name: "Agenda" });

  const nav = within(view.getByRole("navigation", { name: "Primary" }));
  const today = nav.getByRole("button", { name: "Today" });
  const calendar = nav.getByRole("button", { name: "Calendar" });
  expect(today.getAttribute("aria-current")).toBeNull();
  expect(calendar.getAttribute("aria-current")).toBe("page");
});

test("the registry renders the agenda (10) before Due today (20)", async () => {
  const view = await renderApp("/");

  const agendaRow = await view.findByText("Standup");
  const dueRow = await view.findByText("Pay invoices");
  // DOCUMENT_POSITION_FOLLOWING: order 10 (agenda) precedes order 20.
  expect(agendaRow.compareDocumentPosition(dueRow) & 4).toBe(4);
});

test("an interleaved registry section renders strictly by order", async () => {
  const calendarApi: CalendarApi = {
    today: () => Promise.resolve({ homeTimezone: HOME_TZ, today: TODAY }),
    range: () =>
      Promise.resolve({
        homeTimezone: HOME_TZ,
        days: [{ date: TODAY, events: [standup] }],
      }),
  };
  const tasksApi: TasksApi = {
    list: () => Promise.resolve({ tasks: [] }),
    today: () =>
      Promise.resolve({
        homeTimezone: HOME_TZ,
        today: TODAY,
        tasks: [dueTask],
      }),
    create: () => Promise.reject(new Error("not under test")),
    toggle: () => Promise.reject(new Error("not under test")),
    delete: () => Promise.reject(new Error("not under test")),
  };
  const todayApi: TodayApi = {
    home: () => Promise.resolve({ homeTimezone: HOME_TZ, today: TODAY }),
    googleConnectionStatus: () => Promise.resolve("active"),
  };
  const fakeSection: TodaySection = {
    id: "fake.section",
    order: 15,
    component: () => <p>Fake section body</p>,
  };
  const api = stubApi();
  const router = createAppRouter(
    api,
    [
      createTodayWebModule({
        api: todayApi,
        sections: [fakeSection, ...buildTodaySections(calendarApi, tasksApi)],
      }),
    ],
    createMemoryHistory({ initialEntries: ["/"] }),
  );
  await router.load();
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider api={api}>
        <RouterProvider router={router} />
      </ApiProvider>
    </QueryClientProvider>,
  );

  const agendaRow = await view.findByText("Standup");
  const fake = await view.findByText("Fake section body");
  const dueRow = await view.findByText("Pay invoices");
  // DOCUMENT_POSITION_FOLLOWING: 10 (agenda) < 15 (fake) < 20 (tasks).
  expect(agendaRow.compareDocumentPosition(fake) & 4).toBe(4);
  expect(fake.compareDocumentPosition(dueRow) & 4).toBe(4);
});
