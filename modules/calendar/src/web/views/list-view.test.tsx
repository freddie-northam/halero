import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { AgendaEvent } from "../../contract";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";
import { ListView } from "./list-view";

beforeAll(() => {
  registerHappyDom();
});
afterEach(cleanup);
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await unregisterHappyDom();
});

const HOME_TZ = "Europe/London";

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

test("renders a row per event with date, time, and location text", () => {
  const timed = event({
    entityId: "ev-standup",
    title: "Standup",
    start: Date.UTC(2025, 6, 2, 8, 30, 0),
    end: Date.UTC(2025, 6, 2, 8, 45, 0),
    location: "Meeting room 2",
  });
  const allDay = event({
    entityId: "ev-conference",
    title: "Conference",
    allDay: true,
    start: Date.UTC(2025, 6, 3, 0, 0, 0),
    end: Date.UTC(2025, 6, 4, 0, 0, 0),
  });
  const view = render(
    <ListView
      events={[timed, allDay]}
      timeZone={HOME_TZ}
      onEditEvent={() => {}}
    />,
  );

  expect(view.getByText("Standup")).toBeTruthy();
  expect(view.getByText("Meeting room 2")).toBeTruthy();
  // 08:30Z rendered in Europe/London (BST) is 09:30.
  expect(view.getByText(/09:30 - 09:45/)).toBeTruthy();
  expect(view.getByText("Conference")).toBeTruthy();
  expect(view.getByText("All day")).toBeTruthy();
});

test("a user (editable) event's title is a button that calls onEditEvent", () => {
  const userEvent = event({
    entityId: "ev-user",
    title: "1:1 with Sam",
    editable: true,
  });
  const calls: AgendaEvent[] = [];
  const view = render(
    <ListView
      events={[userEvent]}
      timeZone={HOME_TZ}
      onEditEvent={(clicked) => calls.push(clicked)}
    />,
  );

  const button = view.getByRole("button", { name: /1:1 with Sam/ });
  expect(button.querySelector("span.rounded-full")).not.toBeNull();
  fireEvent.click(button);

  expect(calls).toEqual([userEvent]);
});

test("a Google (non-editable) event's title is plain text with no accent dot", () => {
  const googleEvent = event({ entityId: "ev-google", title: "Dentist" });
  const view = render(
    <ListView
      events={[googleEvent]}
      timeZone={HOME_TZ}
      onEditEvent={() => {
        throw new Error("should never be called");
      }}
    />,
  );

  expect(view.queryByRole("button", { name: /Dentist/ })).toBeNull();
  // Assert at the whole cell, not the text span (the dot is a sibling of
  // the text, so a span-scoped query would miss a mistakenly added dot).
  const cell = view.getByText("Dentist").closest("td");
  expect(cell?.querySelector("span.rounded-full")).toBeNull();
});

test("clicking a sortable header reorders rows and toggles aria-sort", () => {
  const a = event({ entityId: "a", title: "Alpha", start: 200 });
  const b = event({ entityId: "b", title: "Beta", start: 100 });
  const view = render(
    <ListView events={[a, b]} timeZone={HOME_TZ} onEditEvent={() => {}} />,
  );

  const titleHeader = view.getByRole("columnheader", { name: /Title/ });
  expect(titleHeader.getAttribute("aria-sort")).toBe("none");

  const titleButton = view.getByRole("button", { name: "Title" });
  fireEvent.click(titleButton);

  expect(titleHeader.getAttribute("aria-sort")).toBe("ascending");
  let rows = view.getAllByRole("row").slice(1);
  expect(rows[0]?.textContent).toContain("Alpha");
  expect(rows[1]?.textContent).toContain("Beta");

  fireEvent.click(titleButton);

  expect(titleHeader.getAttribute("aria-sort")).toBe("descending");
  rows = view.getAllByRole("row").slice(1);
  expect(rows[0]?.textContent).toContain("Beta");
  expect(rows[1]?.textContent).toContain("Alpha");
});

test("the Date header starts as the active ascending sort", () => {
  const view = render(
    <ListView
      events={[event({ entityId: "a" })]}
      timeZone={HOME_TZ}
      onEditEvent={() => {}}
    />,
  );

  expect(
    view.getByRole("columnheader", { name: /Date/ }).getAttribute("aria-sort"),
  ).toBe("ascending");
});

test("renders the empty state when there are no events", () => {
  const view = render(
    <ListView events={[]} timeZone={HOME_TZ} onEditEvent={() => {}} />,
  );

  expect(view.getByText("No events this month.")).toBeTruthy();
  expect(view.queryByRole("table")).toBeNull();
});
