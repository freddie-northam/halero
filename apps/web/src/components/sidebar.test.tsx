import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
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
  const view = render(<Sidebar onLogout={() => undefined} />);
  expect(view.getByRole("navigation", { name: "Primary" })).toBeTruthy();
  const today = view.getByRole("button", { name: "Today" });
  const calendar = view.getByRole("button", { name: "Calendar" });
  const settings = view.getByRole("button", { name: "Settings" });
  expect(today.getAttribute("aria-current")).toBe("page");
  expect(calendar.getAttribute("aria-current")).toBeNull();
  expect(settings.getAttribute("aria-current")).toBeNull();
});
