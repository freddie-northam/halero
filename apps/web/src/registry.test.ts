import { describe, expect, test } from "bun:test";
import type { TrpcClient } from "./lib/trpc";
import { buildNav, buildWebModules } from "./registry";

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

describe("the shipped web module registry", () => {
  test("provides the calendar page and nav entry from the module", () => {
    const modules = buildWebModules(stubClient);
    const calendar = modules.find((module) => module.id === "calendar");

    expect(calendar?.nav).toEqual([
      { label: "Calendar", path: "/calendar", order: 20 },
    ]);
    expect(calendar?.pages?.map((page) => page.path)).toEqual(["/calendar"]);
  });
});

describe("buildNav", () => {
  test("keeps Today and Settings in core and sorts everything by order", () => {
    const nav = buildNav(buildWebModules(stubClient));

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

    expect(nav.map((entry) => entry.label)).toEqual(["Today", "Settings"]);
  });

  test("orders a module entry after Settings when its order says so", () => {
    const nav = buildNav([
      { id: "late", nav: [{ label: "Late", path: "/late", order: 900 }] },
    ]);

    expect(nav.map((entry) => entry.label)).toEqual([
      "Today",
      "Settings",
      "Late",
    ]);
  });
});
