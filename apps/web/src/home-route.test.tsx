import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { CalendarApi } from "@halero/module-calendar/web";
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

// The module registry wires its seams straight from the tRPC client, so
// the wiring test stubs the two calendar procedures the page reaches.
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
  ...overrides,
});

const renderApp = async (path: string): Promise<RenderResult> => {
  const api = stubApi();
  const router = createAppRouter(
    api,
    buildWebModules(stubClient, api),
    createMemoryHistory({ initialEntries: [path] }),
  );
  await router.load();
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider api={api}>
        <RouterProvider router={router} />
      </ApiProvider>
    </QueryClientProvider>,
  );
};

test("the index route serves the Today page with the agenda from the stub", async () => {
  const view = await renderApp("/");

  expect(
    await view.findByText(/Good (morning|afternoon|evening)/),
  ).toBeTruthy();
  expect(await view.findByText("Wednesday, 2 July 2025")).toBeTruthy();
  // The calendar section's rows come through the registry-wired seam.
  expect(await view.findByText("Standup")).toBeTruthy();
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

test("a second registry section renders after the agenda in order", async () => {
  const calendarApi: CalendarApi = {
    today: () => Promise.resolve({ homeTimezone: HOME_TZ, today: TODAY }),
    range: () =>
      Promise.resolve({
        homeTimezone: HOME_TZ,
        days: [{ date: TODAY, events: [standup] }],
      }),
  };
  const todayApi: TodayApi = {
    home: () => Promise.resolve({ homeTimezone: HOME_TZ, today: TODAY }),
    googleConnectionStatus: () => Promise.resolve("active"),
  };
  const fakeSection: TodaySection = {
    id: "fake.section",
    order: 20,
    component: () => <p>Fake section body</p>,
  };
  const api = stubApi();
  const router = createAppRouter(
    api,
    [
      createTodayWebModule({
        api: todayApi,
        sections: [fakeSection, ...buildTodaySections(calendarApi)],
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
  // DOCUMENT_POSITION_FOLLOWING: order 10 (agenda) precedes order 20.
  expect(agendaRow.compareDocumentPosition(fake) & 4).toBe(4);
});
