import { expect, test } from "bun:test";
import type { SidebarNavItem } from "../components/sidebar";
import { navItemFor } from "./shell";

const NAV: readonly SidebarNavItem[] = [
  { label: "Today", path: "/" },
  { label: "Calendar", path: "/calendar" },
  { label: "Tasks", path: "/tasks" },
  { label: "Notes", path: "/notes" },
];

test("matches a nav entry by exact path", () => {
  expect(navItemFor(NAV, "/calendar")?.label).toBe("Calendar");
});

test("matches a module detail sub-route to its nav entry", () => {
  // The Notes editor route is not itself a nav entry.
  expect(navItemFor(NAV, "/notes/$noteId")?.label).toBe("Notes");
});

test("root only matches exactly, never as a prefix", () => {
  expect(navItemFor(NAV, "/")?.label).toBe("Today");
  // A sub-route with no matching nav entry must not fall through to root.
  expect(navItemFor(NAV, "/unknown/thing")).toBeUndefined();
});

test("does not match a nav path that is only a string prefix, not a segment", () => {
  // "/note" must not match the "/notes" entry.
  expect(navItemFor(NAV, "/note")).toBeUndefined();
});
