import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { AgendaEvent } from "../../contract";
import { weekDates } from "../helpers/date-matrix";
import { minutesOfDayInZone } from "../helpers/format";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";
import { HOUR_ROW_HEIGHT_PX, WeekView } from "./week-view";

beforeAll(() => {
  registerHappyDom();
});
afterEach(cleanup);
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await unregisterHappyDom();
});

const HOME_TZ = "Europe/London";
// 2025-07-02 is a Wednesday; its Monday-start week is 2025-06-30..2025-07-06.
const ANCHOR = "2025-07-02";
const GRID_HEIGHT_PX = HOUR_ROW_HEIGHT_PX * 24;

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

interface Handlers {
  readonly onCreateOn?: (date: string) => void;
  readonly onEditEvent?: (event: AgendaEvent) => void;
}

const renderWeek = (
  eventsByDate: ReadonlyMap<string, readonly AgendaEvent[]>,
  handlers: Handlers = {},
) =>
  render(
    <WeekView
      anchor={ANCHOR}
      today={ANCHOR}
      eventsByDate={eventsByDate}
      timeZone={HOME_TZ}
      onCreateOn={handlers.onCreateOn ?? (() => {})}
      onEditEvent={handlers.onEditEvent ?? (() => {})}
    />,
  );

test("renders the 7 Monday-start day headers, each with an add affordance", () => {
  const view = renderWeek(new Map());

  for (const date of weekDates(ANCHOR)) {
    expect(
      view.getByRole("button", { name: `Add event on ${date}` }),
    ).toBeTruthy();
  }
});

test("today's day header carries the accent ring marker", () => {
  const view = renderWeek(new Map());

  const todayHeader = view.container.querySelector('[aria-current="date"]');
  expect(todayHeader).not.toBeNull();
});

test("renders the hour axis from 00:00 to 23:00", () => {
  const view = renderWeek(new Map());

  expect(view.getByText("00:00")).toBeTruthy();
  expect(view.getByText("23:00")).toBeTruthy();
});

test("the per-day add affordance calls onCreateOn with that day's date", () => {
  const calls: string[] = [];
  const view = renderWeek(new Map(), {
    onCreateOn: (date) => calls.push(date),
  });

  fireEvent.click(view.getByRole("button", { name: `Add event on ${ANCHOR}` }));

  expect(calls).toEqual([ANCHOR]);
});

test("a timed event is positioned in its day column by minutes-of-day", () => {
  // 09:30 in Europe/London (BST) in July is 08:30 UTC.
  const start = Date.UTC(2025, 6, 2, 8, 30, 0);
  const end = Date.UTC(2025, 6, 2, 9, 0, 0);
  const meeting = event({
    entityId: "ev-meeting",
    title: "Standup",
    start,
    end,
  });
  const view = renderWeek(new Map([[ANCHOR, [meeting]]]));

  const block = view.getByTitle("Standup");
  const expectedTop =
    (minutesOfDayInZone(start, HOME_TZ) / (24 * 60)) * GRID_HEIGHT_PX;
  const expectedHeight =
    ((minutesOfDayInZone(end, HOME_TZ) - minutesOfDayInZone(start, HOME_TZ)) /
      (24 * 60)) *
    GRID_HEIGHT_PX;
  expect(block.style.top).toBe(`${expectedTop}px`);
  expect(block.style.height).toBe(`${expectedHeight}px`);
});

test("an all-day event renders in the all-day row", () => {
  const holiday = event({
    entityId: "ev-holiday",
    title: "Bank Holiday",
    allDay: true,
  });
  const view = renderWeek(new Map([[ANCHOR, [holiday]]]));

  expect(view.getByText("Bank Holiday")).toBeTruthy();
});

test("a user (editable) timed event is a button that calls onEditEvent", () => {
  const userEvent = event({
    entityId: "ev-user",
    title: "1:1",
    editable: true,
    start: Date.UTC(2025, 6, 2, 9, 0, 0),
    end: Date.UTC(2025, 6, 2, 9, 30, 0),
  });
  const calls: AgendaEvent[] = [];
  const view = renderWeek(new Map([[ANCHOR, [userEvent]]]), {
    onEditEvent: (clicked) => calls.push(clicked),
  });

  fireEvent.click(view.getByRole("button", { name: /1:1/ }));

  expect(calls).toEqual([userEvent]);
});

test("a Google (non-editable) timed event is not clickable", () => {
  const googleEvent = event({
    entityId: "ev-google",
    title: "Dentist",
    start: Date.UTC(2025, 6, 2, 9, 0, 0),
    end: Date.UTC(2025, 6, 2, 9, 30, 0),
  });
  const calls: AgendaEvent[] = [];
  const view = renderWeek(new Map([[ANCHOR, [googleEvent]]]), {
    onEditEvent: (clicked) => calls.push(clicked),
  });

  fireEvent.click(view.getByText("Dentist"));

  expect(calls).toEqual([]);
});

test("a user all-day chip calls onEditEvent, a Google all-day chip does not", () => {
  const userHoliday = event({
    entityId: "ev-user-allday",
    title: "Day off",
    allDay: true,
    editable: true,
  });
  const googleHoliday = event({
    entityId: "ev-google-allday",
    title: "Bank Holiday",
    allDay: true,
  });
  const calls: AgendaEvent[] = [];
  const view = renderWeek(new Map([[ANCHOR, [userHoliday, googleHoliday]]]), {
    onEditEvent: (clicked) => calls.push(clicked),
  });

  fireEvent.click(view.getByRole("button", { name: /Day off/ }));
  fireEvent.click(view.getByText("Bank Holiday"));

  expect(calls).toEqual([userHoliday]);
});

test("two overlapping timed events render side by side in distinct lanes", () => {
  const first = event({
    entityId: "ev-first",
    title: "First",
    start: Date.UTC(2025, 6, 2, 9, 0, 0),
    end: Date.UTC(2025, 6, 2, 10, 0, 0),
  });
  const second = event({
    entityId: "ev-second",
    title: "Second",
    start: Date.UTC(2025, 6, 2, 9, 30, 0),
    end: Date.UTC(2025, 6, 2, 10, 30, 0),
  });
  const view = renderWeek(new Map([[ANCHOR, [first, second]]]));

  const firstBlock = view.getByTitle("First");
  const secondBlock = view.getByTitle("Second");
  expect(firstBlock.style.left).not.toBe(secondBlock.style.left);
  expect(firstBlock.style.width).not.toBe("100%");
  expect(secondBlock.style.width).not.toBe("100%");
});
