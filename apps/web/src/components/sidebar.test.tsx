import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";
import { Sidebar } from "./sidebar";

beforeAll(() => {
  registerHappyDom();
});
afterEach(cleanup);
afterAll(async () => {
  await unregisterHappyDom();
});

test("renders the nav items with aria-current on the active one", () => {
  const view = render(
    <Sidebar
      active="Today"
      onNavigate={() => undefined}
      onLogout={() => undefined}
    />,
  );
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
  const view = render(
    <Sidebar
      active="Today"
      onNavigate={(item) => visited.push(item)}
      onLogout={() => undefined}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Settings" }));
  expect(visited).toEqual(["Settings"]);
});
