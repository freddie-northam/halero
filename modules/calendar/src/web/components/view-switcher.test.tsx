import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { CalendarView } from "../helpers/calendar-search";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";
import { ViewSwitcher } from "./view-switcher";

beforeAll(() => {
  registerHappyDom();
});
afterEach(cleanup);
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await unregisterHappyDom();
});

test("renders a tab for every view including the new List tab", () => {
  const view = render(<ViewSwitcher view="month" onViewChange={() => {}} />);

  expect(view.getByRole("tab", { name: "Month" })).toBeTruthy();
  expect(view.getByRole("tab", { name: "Week" })).toBeTruthy();
  expect(view.getByRole("tab", { name: "Agenda" })).toBeTruthy();
  expect(view.getByRole("tab", { name: "List" })).toBeTruthy();
});

test("clicking the List tab reports the list view", () => {
  const calls: CalendarView[] = [];
  const view = render(
    <ViewSwitcher view="month" onViewChange={(next) => calls.push(next)} />,
  );

  const listTab = view.getByRole("tab", { name: "List" });
  fireEvent.mouseDown(listTab, { button: 0 });
  fireEvent.click(listTab);

  expect(calls).toEqual(["list"]);
});

test("the List tab is selected when the current view is list", () => {
  const view = render(<ViewSwitcher view="list" onViewChange={() => {}} />);

  expect(
    view.getByRole("tab", { name: "List" }).getAttribute("aria-selected"),
  ).toBe("true");
});
