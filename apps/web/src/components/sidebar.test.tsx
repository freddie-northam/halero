import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { SidebarProvider } from "@halero/ui";
import {
  cleanup,
  fireEvent,
  type RenderResult,
  render,
} from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";
import { AppSidebar, type AppSidebarProps } from "./sidebar";

beforeAll(() => {
  registerHappyDom();
});
afterEach(cleanup);
afterAll(async () => {
  await unregisterHappyDom();
});

// The registry drives the items in the app; the tests pin the same shape.
const NAV_ITEMS = [
  { label: "Today", path: "/" },
  { label: "Calendar", path: "/calendar" },
  { label: "Settings", path: "/settings" },
] as const;

// The sidebar components read shadcn's sidebar context, so the tests
// render them inside the provider just like the shell does.
const renderSidebar = (props: AppSidebarProps): RenderResult =>
  render(
    <SidebarProvider>
      <AppSidebar {...props} />
    </SidebarProvider>,
  );

test("renders the nav items with aria-current on the active one", () => {
  const view = renderSidebar({
    items: NAV_ITEMS,
    activePath: "/",
    onNavigate: () => undefined,
  });
  expect(view.getByRole("navigation", { name: "Primary" })).toBeTruthy();
  const today = view.getByRole("button", { name: "Today" });
  const calendar = view.getByRole("button", { name: "Calendar" });
  const settings = view.getByRole("button", { name: "Settings" });
  expect(today.getAttribute("aria-current")).toBe("page");
  expect(calendar.getAttribute("aria-current")).toBeNull();
  expect(settings.getAttribute("aria-current")).toBeNull();
});

test("marks a module-contributed item active on its own path", () => {
  const view = renderSidebar({
    items: NAV_ITEMS,
    activePath: "/calendar",
    onNavigate: () => undefined,
  });
  const calendar = view.getByRole("button", { name: "Calendar" });
  const today = view.getByRole("button", { name: "Today" });
  expect(calendar.getAttribute("aria-current")).toBe("page");
  expect(today.getAttribute("aria-current")).toBeNull();
});

test("reports the path a click asks to navigate to", () => {
  const visited: string[] = [];
  const view = renderSidebar({
    items: NAV_ITEMS,
    activePath: "/",
    onNavigate: (path) => visited.push(path),
  });
  fireEvent.click(view.getByRole("button", { name: "Settings" }));
  expect(visited).toEqual(["/settings"]);
});

test("offers Refer a friend and Help as external repo links, not sign out", () => {
  const view = renderSidebar({
    items: NAV_ITEMS,
    activePath: "/",
    onNavigate: () => undefined,
  });
  const refer = view.getByRole("link", { name: "Refer a friend" });
  const help = view.getByRole("link", { name: "Help" });
  expect(refer.getAttribute("href")).toContain("github.com");
  expect(refer.getAttribute("target")).toBe("_blank");
  expect(help.getAttribute("href")).toContain("github.com");
  // Sign out lives in Settings now, never in the sidebar.
  expect(view.queryByRole("button", { name: /sign out|log out/i })).toBeNull();
});
