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
import type { TodaySection } from "./sections";
import { registerHappyDom, unregisterHappyDom } from "./test/happy-dom";
import { createTodayScreen, type TodayApi } from "./today-screen";

beforeAll(() => {
  registerHappyDom();
});
afterEach(cleanup);
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await unregisterHappyDom();
});

// 2026-07-01T23:00Z: evening in UTC, but already Thursday morning in the
// Tokyo home timezone, so the greeting proves it reads the HOME-tz hour.
const NOW = Date.UTC(2026, 6, 1, 23, 0, 0);
const HOME = { homeTimezone: "Asia/Tokyo", today: "2026-07-02" };

const stubApi = (overrides: Partial<TodayApi> = {}): TodayApi => ({
  home: () => Promise.resolve(HOME),
  googleConnectionStatus: () => Promise.resolve("active"),
  ...overrides,
});

const section = (id: string, order: number, text: string): TodaySection => ({
  id,
  order,
  component: () => <p>{text}</p>,
});

const renderToday = async (
  api: TodayApi,
  sections: readonly TodaySection[] = [],
) => {
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: createTodayScreen(api, sections, () => NOW),
  });
  // The reauth alert and the connect pointer link here.
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: (): ReactElement => <p>Settings page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, settingsRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

test("greets by the home-timezone hour and shows the full date line", async () => {
  const view = await renderToday(stubApi());

  // 23:00 UTC is 08:00 in Tokyo: morning at home even though the clock
  // instant is evening in UTC (and whatever the test runner's tz is).
  expect(await view.findByText("Good morning")).toBeTruthy();
  // The weekday comma in en-GB long dates is ICU-version-dependent, so
  // match it optionally rather than pinning one runtime's ICU output.
  expect(view.getByText(/^Thursday,? 2 July 2026$/)).toBeTruthy();
});

test("renders the sections sorted by order, not array position", async () => {
  const view = await renderToday(stubApi(), [
    section("second", 20, "Second section"),
    section("first", 10, "First section"),
  ]);

  const first = await view.findByText("First section");
  const second = view.getByText("Second section");
  // DOCUMENT_POSITION_FOLLOWING: the order-20 section comes after order-10.
  expect(first.compareDocumentPosition(second) & 4).toBe(4);
});

test("surfaces a reconnect alert only when Google needs a new sign-in", async () => {
  const view = await renderToday(
    stubApi({
      googleConnectionStatus: () => Promise.resolve("reauth_required"),
    }),
  );

  expect(
    await view.findByText(/Google Calendar needs to be reconnected/),
  ).toBeTruthy();
  const link = view.getByRole("link", { name: "Open Settings" });
  expect(link.getAttribute("href")).toBe("/settings");
});

test("shows no connection hints while the connection is healthy", async () => {
  const view = await renderToday(stubApi());
  await view.findByText("Good morning");

  expect(
    view.queryByText(/Google Calendar needs to be reconnected/),
  ).toBeNull();
  expect(view.queryByText(/Connect Google Calendar in/)).toBeNull();
});

test("points to Settings when no connection is configured yet", async () => {
  const view = await renderToday(
    stubApi({ googleConnectionStatus: () => Promise.resolve(null) }),
  );

  expect(await view.findByText(/Connect Google Calendar in/)).toBeTruthy();
  const link = view.getByRole("link", { name: "Settings" });
  expect(link.getAttribute("href")).toBe("/settings");
});

test("shows a readable error when the home anchor cannot load", async () => {
  const view = await renderToday(
    stubApi({
      home: () =>
        Promise.reject(new Error("You need to sign in before doing that.")),
    }),
  );

  expect(
    await view.findByText("You need to sign in before doing that."),
  ).toBeTruthy();
});
