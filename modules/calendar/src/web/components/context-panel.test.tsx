import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { AgendaEvent } from "../../contract";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";
import { ContextPanel } from "./context-panel";

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

test("Next up renders the upcoming event's details: time, duration, location, link, and notes", () => {
  const upcoming = event({
    entityId: "ev-upcoming",
    title: "Board sync",
    // 09:00-09:30 UTC in July is 10:00-10:30 in Europe/London (BST).
    start: Date.UTC(2025, 6, 2, 9, 0, 0),
    end: Date.UTC(2025, 6, 2, 9, 30, 0),
    location: "Boardroom",
    url: "https://meet.example.com/board",
    notes: "Bring the deck",
  });
  const view = render(
    <ContextPanel
      upcoming={upcoming}
      selected={null}
      timeZone={HOME_TZ}
      onEdit={() => {}}
      onClearSelection={() => {}}
    />,
  );

  expect(view.getByText("Next up")).toBeTruthy();
  expect(view.getByText("Board sync")).toBeTruthy();
  expect(view.getByText(/10:00 - 10:30/)).toBeTruthy();
  expect(view.getByText(/30m/)).toBeTruthy();
  expect(view.getByText("Boardroom")).toBeTruthy();
  expect(view.getByText("Bring the deck")).toBeTruthy();
  const link = view.getByText("https://meet.example.com/board");
  expect(link.tagName).toBe("A");
  expect(link.getAttribute("href")).toBe("https://meet.example.com/board");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noreferrer noopener");
});

test("Next up shows All day and no duration for an all-day event", () => {
  const upcoming = event({
    entityId: "ev-holiday",
    title: "Bank Holiday",
    allDay: true,
    start: Date.UTC(2025, 6, 2, 0, 0, 0),
    end: Date.UTC(2025, 6, 3, 0, 0, 0),
  });
  const view = render(
    <ContextPanel
      upcoming={upcoming}
      selected={null}
      timeZone={HOME_TZ}
      onEdit={() => {}}
      onClearSelection={() => {}}
    />,
  );

  expect(view.getByText("All day")).toBeTruthy();
});

test("Next up shows a muted message when there is nothing upcoming", () => {
  const view = render(
    <ContextPanel
      upcoming={null}
      selected={null}
      timeZone={HOME_TZ}
      onEdit={() => {}}
      onClearSelection={() => {}}
    />,
  );

  expect(view.getByText("Nothing coming up.")).toBeTruthy();
});

test("the Selected section is omitted when nothing is selected", () => {
  const view = render(
    <ContextPanel
      upcoming={null}
      selected={null}
      timeZone={HOME_TZ}
      onEdit={() => {}}
      onClearSelection={() => {}}
    />,
  );

  expect(view.queryByText("Selected")).toBeNull();
});

test("the Selected section's Edit button calls onEdit for an editable event", () => {
  const selected = event({
    entityId: "ev-user",
    title: "1:1 with Sam",
    editable: true,
  });
  const calls: AgendaEvent[] = [];
  const view = render(
    <ContextPanel
      upcoming={null}
      selected={selected}
      timeZone={HOME_TZ}
      onEdit={(clicked) => calls.push(clicked)}
      onClearSelection={() => {}}
    />,
  );

  expect(view.getByText("Selected")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Edit" }));

  expect(calls).toEqual([selected]);
});

test("the Selected section has no Edit button for a Google (non-editable) event", () => {
  const selected = event({ entityId: "ev-google", title: "Dentist" });
  const view = render(
    <ContextPanel
      upcoming={null}
      selected={selected}
      timeZone={HOME_TZ}
      onEdit={() => {
        throw new Error("should never be called");
      }}
      onClearSelection={() => {}}
    />,
  );

  expect(view.getByText("Selected")).toBeTruthy();
  expect(view.queryByRole("button", { name: "Edit" })).toBeNull();
});

test("clearing the selection calls onClearSelection", () => {
  const selected = event({ entityId: "ev-user", title: "1:1 with Sam" });
  let cleared = false;
  const view = render(
    <ContextPanel
      upcoming={null}
      selected={selected}
      timeZone={HOME_TZ}
      onEdit={() => {}}
      onClearSelection={() => {
        cleared = true;
      }}
    />,
  );

  fireEvent.click(view.getByRole("button", { name: "Clear selection" }));

  expect(cleared).toBe(true);
});
