import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import type { AgendaEvent, CalendarRange } from "../contract";
import type { CalendarApi } from "./calendar-screen";
import { registerHappyDom, unregisterHappyDom } from "./test/happy-dom";
import { createTodayAgendaSection } from "./today-agenda-section";

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

const event = (
  seed: Partial<AgendaEvent> & { entityId: string },
): AgendaEvent => ({
  title: "Untitled",
  allDay: false,
  start: 0,
  end: 0,
  location: null,
  calendarId: "primary",
  recurring: false,
  notes: null,
  url: null,
  editable: false,
  ...seed,
});

// Served as the server would: all-day first, then by start time.
const todaysEvents: readonly AgendaEvent[] = [
  event({
    entityId: "ev-allday",
    title: "Conference",
    allDay: true,
    start: Date.UTC(2025, 6, 1, 23, 0, 0),
    end: Date.UTC(2025, 6, 2, 23, 0, 0),
  }),
  event({
    entityId: "ev-standup",
    title: "Standup",
    start: Date.UTC(2025, 6, 2, 8, 30, 0),
    end: Date.UTC(2025, 6, 2, 8, 45, 0),
    location: "Meeting room 2",
    recurring: true,
  }),
];

const fixtureApi: CalendarApi = {
  today: () => Promise.resolve({ homeTimezone: HOME_TZ, today: TODAY }),
  range: (from) =>
    Promise.resolve<CalendarRange>({
      homeTimezone: HOME_TZ,
      days: from === TODAY ? [{ date: TODAY, events: todaysEvents }] : [],
    }),
};

const renderSection = async (api: CalendarApi) => {
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: createTodayAgendaSection(api),
  });
  // The row links and the "Open calendar" link resolve against this.
  const calendarRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/calendar",
    component: (): ReactElement => <p>Calendar page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, calendarRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

test("lists today's events with the all-day one leading and times in the home tz", async () => {
  const view = await renderSection(fixtureApi);

  const conference = await view.findByText("Conference");
  const standup = view.getByText("Standup");
  // DOCUMENT_POSITION_FOLLOWING: the timed event comes after the all-day one.
  expect(conference.compareDocumentPosition(standup) & 4).toBe(4);
  expect(view.getByText("all day")).toBeTruthy();
  // 08:30Z rendered in Europe/London (BST) is 09:30.
  expect(view.getByText(/09:30/)).toBeTruthy();
  expect(view.getByText("Meeting room 2")).toBeTruthy();
  expect(view.getAllByLabelText("Repeats").length).toBe(1);
});

test("each row links into the agenda anchored on today", async () => {
  const view = await renderSection(fixtureApi);
  await view.findByText("Conference");

  const rowLink = view.getByRole("link", { name: /Standup/ });
  expect(rowLink.getAttribute("href")).toBe(
    `/calendar?view=agenda&date=${TODAY}`,
  );
});

test("offers an Open calendar link into the agenda view", async () => {
  const view = await renderSection(fixtureApi);

  const open = await view.findByRole("link", { name: "Open calendar" });
  expect(open.getAttribute("href")).toBe("/calendar?view=agenda");
});

test("shows the quiet empty line when nothing is scheduled today", async () => {
  const emptyApi: CalendarApi = {
    today: fixtureApi.today,
    range: () => Promise.resolve({ homeTimezone: HOME_TZ, days: [] }),
  };
  const view = await renderSection(emptyApi);

  expect(await view.findByText("Nothing scheduled today.")).toBeTruthy();
});

test("shows a readable error when today's events cannot load", async () => {
  const failingApi: CalendarApi = {
    today: fixtureApi.today,
    range: () =>
      Promise.reject(new Error("You need to sign in before doing that.")),
  };
  const view = await renderSection(failingApi);

  expect(
    await view.findByText("You need to sign in before doing that."),
  ).toBeTruthy();
});
