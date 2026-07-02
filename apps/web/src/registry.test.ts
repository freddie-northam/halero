import { describe, expect, test } from "bun:test";
import type { CalendarApi } from "@halero/module-calendar/web";
import type { HaleroApi } from "./lib/api";
import type { TrpcClient } from "./lib/trpc";
import { buildNav, buildTodaySections, buildWebModules } from "./registry";

const stubClient = {
  modules: {
    calendar: {
      today: {
        query: () =>
          Promise.resolve({ homeTimezone: "UTC", today: "2023-11-14" }),
      },
      range: {
        query: () => Promise.resolve({ homeTimezone: "UTC", days: [] }),
      },
    },
  },
} as unknown as TrpcClient;

const stubApi = {
  googleStatus: () =>
    Promise.resolve({
      clientConfigured: false,
      httpsOk: true,
      redirectUri: "http://localhost:4253/api/oauth/google/callback",
      connection: null,
    }),
} as unknown as HaleroApi;

const stubCalendarApi: CalendarApi = {
  today: () => Promise.resolve({ homeTimezone: "UTC", today: "2023-11-14" }),
  range: () => Promise.resolve({ homeTimezone: "UTC", days: [] }),
};

describe("the shipped web module registry", () => {
  test("provides the calendar page and nav entry from the module", () => {
    const modules = buildWebModules(stubClient, stubApi);
    const calendar = modules.find((module) => module.id === "calendar");

    expect(calendar?.nav).toEqual([
      { label: "Calendar", path: "/calendar", order: 20 },
    ]);
    expect(calendar?.pages?.map((page) => page.path)).toEqual(["/calendar"]);
  });

  test("provides the home page and Today nav entry from the today module", () => {
    const modules = buildWebModules(stubClient, stubApi);
    const today = modules.find((module) => module.id === "today");

    expect(today?.nav).toEqual([{ label: "Today", path: "/", order: 10 }]);
    expect(today?.pages?.map((page) => page.path)).toEqual(["/"]);
  });

  test("hardcodes the calendar agenda as the first Today section", () => {
    const sections = buildTodaySections(stubCalendarApi);

    expect(sections.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: "calendar.agenda", order: 10 },
    ]);
  });
});

describe("buildNav", () => {
  test("keeps Settings in core and sorts everything by order", () => {
    const nav = buildNav(buildWebModules(stubClient, stubApi));

    expect(nav.map((entry) => entry.label)).toEqual([
      "Today",
      "Calendar",
      "Settings",
    ]);
    expect(nav.map((entry) => entry.path)).toEqual([
      "/",
      "/calendar",
      "/settings",
    ]);
  });

  test("renders core-only nav when no modules contribute", () => {
    const nav = buildNav([]);

    expect(nav.map((entry) => entry.label)).toEqual(["Settings"]);
  });

  test("orders a module entry after Settings when its order says so", () => {
    const nav = buildNav([
      { id: "late", nav: [{ label: "Late", path: "/late", order: 900 }] },
    ]);

    expect(nav.map((entry) => entry.label)).toEqual(["Settings", "Late"]);
  });
});
