import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { AgendaEvent } from "../../contract";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";
import { MonthView } from "./month-view";

beforeAll(() => {
  registerHappyDom();
});
afterEach(cleanup);
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await unregisterHappyDom();
});

const HOME_TZ = "Europe/London";
const ANCHOR = "2025-07-02";

const event = (
  seed: Partial<AgendaEvent> & { entityId: string },
): AgendaEvent => ({
  title: "Untitled",
  allDay: true,
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
  readonly onOpenDay?: (date: string) => void;
  readonly onCreateOn?: (date: string) => void;
  readonly onEditEvent?: (event: AgendaEvent) => void;
}

const renderMonth = (
  eventsByDate: ReadonlyMap<string, readonly AgendaEvent[]>,
  handlers: Handlers = {},
) =>
  render(
    <MonthView
      anchor={ANCHOR}
      today={ANCHOR}
      eventsByDate={eventsByDate}
      timeZone={HOME_TZ}
      onOpenDay={handlers.onOpenDay ?? (() => {})}
      onCreateOn={handlers.onCreateOn ?? (() => {})}
      onEditEvent={handlers.onEditEvent ?? (() => {})}
    />,
  );

test("the add-event affordance calls onCreateOn with that cell's date", () => {
  const calls: string[] = [];
  const view = renderMonth(new Map(), {
    onCreateOn: (date) => calls.push(date),
  });

  fireEvent.click(view.getByRole("button", { name: `Add event on ${ANCHOR}` }));

  expect(calls).toEqual([ANCHOR]);
});

test("a user (editable) event chip click calls onEditEvent", () => {
  const userEvent = event({
    entityId: "ev-user",
    title: "1:1",
    editable: true,
  });
  const calls: AgendaEvent[] = [];
  const view = renderMonth(new Map([[ANCHOR, [userEvent]]]), {
    onEditEvent: (clickedEvent) => calls.push(clickedEvent),
  });

  fireEvent.click(view.getByRole("button", { name: /1:1/ }));

  expect(calls).toEqual([userEvent]);
});

test("a Google (non-editable) event chip click does not call onEditEvent", () => {
  const googleEvent = event({ entityId: "ev-google", title: "Dentist" });
  const calls: AgendaEvent[] = [];
  const view = renderMonth(new Map([[ANCHOR, [googleEvent]]]), {
    onEditEvent: (clickedEvent) => calls.push(clickedEvent),
  });

  fireEvent.click(view.getByText("Dentist"));

  expect(calls).toEqual([]);
});

test("+N more still hands off to onOpenDay", () => {
  const busyEvents = [1, 2, 3, 4].map((index) =>
    event({ entityId: `ev-${index}`, title: `Busy ${index}` }),
  );
  const calls: string[] = [];
  const view = renderMonth(new Map([[ANCHOR, busyEvents]]), {
    onOpenDay: (date) => calls.push(date),
  });

  fireEvent.click(view.getByText("+1 more"));

  expect(calls).toEqual([ANCHOR]);
});
