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
    active: "Today",
    onNavigate: () => undefined,
    onLogout: () => undefined,
  });
  expect(view.getByRole("navigation", { name: "Primary" })).toBeTruthy();
  const today = view.getByRole("button", { name: "Today" });
  const calendar = view.getByRole("button", { name: "Calendar" });
  const settings = view.getByRole("button", { name: "Settings" });
  expect(today.getAttribute("aria-current")).toBe("page");
  expect(calendar.getAttribute("aria-current")).toBeNull();
  expect(settings.getAttribute("aria-current")).toBeNull();
});

test("reports the item a click asks to navigate to", () => {
  const visited: string[] = [];
  const view = renderSidebar({
    active: "Today",
    onNavigate: (item) => visited.push(item),
    onLogout: () => undefined,
  });
  fireEvent.click(view.getByRole("button", { name: "Settings" }));
  expect(visited).toEqual(["Settings"]);
});
