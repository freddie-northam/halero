import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, type RenderResult, render } from "@testing-library/react";
import type { Agenda } from "../contract";
import { type CalendarApi, createCalendarScreen } from "./calendar-screen";
import { registerHappyDom, unregisterHappyDom } from "./test/happy-dom";

beforeAll(() => {
  registerHappyDom();
});
afterEach(cleanup);
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await unregisterHappyDom();
});

const emptyAgenda: Agenda = { homeTimezone: "Europe/London", days: [] };

// 08:30Z on 2025-07-02 is 09:30 in London (BST).
const sampleAgenda: Agenda = {
  homeTimezone: "Europe/London",
  days: [
    {
      date: "2025-07-02",
      events: [
        {
          entityId: "ev-allday",
          title: "Conference",
          allDay: true,
          start: Date.UTC(2025, 6, 1, 23, 0, 0),
          end: Date.UTC(2025, 6, 2, 23, 0, 0),
          location: null,
          calendarId: "primary",
        },
        {
          entityId: "ev-standup",
          title: "Standup",
          allDay: false,
          start: Date.UTC(2025, 6, 2, 8, 30, 0),
          end: Date.UTC(2025, 6, 2, 8, 45, 0),
          location: "Meeting room 2",
          calendarId: "primary",
        },
      ],
    },
    {
      date: "2025-07-03",
      events: [
        {
          entityId: "ev-review",
          title: "Review",
          allDay: false,
          start: Date.UTC(2025, 6, 3, 13, 0, 0),
          end: Date.UTC(2025, 6, 3, 14, 0, 0),
          location: null,
          calendarId: "primary",
        },
      ],
    },
  ],
};

const renderCalendar = (api: CalendarApi): RenderResult => {
  const CalendarScreen = createCalendarScreen(api);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CalendarScreen />
    </QueryClientProvider>,
  );
};

test("renders date group headers in a readable long form", async () => {
  const view = renderCalendar({ agenda: () => Promise.resolve(sampleAgenda) });

  expect(await view.findByText("Wednesday 2 July")).toBeTruthy();
  expect(view.getByText("Thursday 3 July")).toBeTruthy();
});

test("shows an all-day badge and home-timezone time ranges", async () => {
  const view = renderCalendar({ agenda: () => Promise.resolve(sampleAgenda) });

  await view.findByText("Conference");
  expect(view.getByText("all day")).toBeTruthy();
  // 08:30Z rendered in Europe/London (BST) is 09:30.
  expect(view.getByText(/09:30/)).toBeTruthy();
  expect(view.getByText(/09:45/)).toBeTruthy();
  expect(view.getByText("Meeting room 2")).toBeTruthy();
});

test("shows the empty state when there are no upcoming events", async () => {
  const view = renderCalendar({ agenda: () => Promise.resolve(emptyAgenda) });

  expect(await view.findByText(/No events in the next 7 days/)).toBeTruthy();
});

test("shows a readable error when the agenda cannot load", async () => {
  const view = renderCalendar({
    agenda: () =>
      Promise.reject(new Error("You need to sign in before doing that.")),
  });

  expect(
    await view.findByText("You need to sign in before doing that."),
  ).toBeTruthy();
});
