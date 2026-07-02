import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, type RenderResult, render } from "@testing-library/react";
import type { Agenda, HaleroApi } from "../lib/api";
import { ApiProvider } from "../lib/api-context";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";
import { CalendarScreen } from "./calendar";

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

const stubApi = (overrides: Partial<HaleroApi> = {}): HaleroApi => ({
  systemStatus: () =>
    Promise.resolve({ needsSetup: false, authenticated: true }),
  setup: () => Promise.resolve(),
  login: () => Promise.resolve(),
  logout: () => Promise.resolve(),
  googleStatus: () =>
    Promise.resolve({
      clientConfigured: true,
      httpsOk: true,
      redirectUri: "https://halero.example.com/api/oauth/google/callback",
      connection: null,
    }),
  saveGoogleClient: () => Promise.resolve(),
  syncGoogleNow: () =>
    Promise.resolve({ status: "success", upserts: 0, deletes: 0, error: null }),
  agenda: () => Promise.resolve(sampleAgenda),
  ...overrides,
});

const renderCalendar = (api: HaleroApi): RenderResult =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider api={api}>
        <CalendarScreen />
      </ApiProvider>
    </QueryClientProvider>,
  );

test("renders date group headers in a readable long form", async () => {
  const view = renderCalendar(stubApi());

  expect(await view.findByText("Wednesday 2 July")).toBeTruthy();
  expect(view.getByText("Thursday 3 July")).toBeTruthy();
});

test("shows an all-day badge and home-timezone time ranges", async () => {
  const view = renderCalendar(stubApi());

  await view.findByText("Conference");
  expect(view.getByText("all day")).toBeTruthy();
  // 08:30Z rendered in Europe/London (BST) is 09:30.
  expect(view.getByText(/09:30/)).toBeTruthy();
  expect(view.getByText(/09:45/)).toBeTruthy();
  expect(view.getByText("Meeting room 2")).toBeTruthy();
});

test("shows the empty state when there are no upcoming events", async () => {
  const view = renderCalendar(
    stubApi({ agenda: () => Promise.resolve(emptyAgenda) }),
  );

  expect(await view.findByText(/No events in the next 7 days/)).toBeTruthy();
});

test("shows a readable error when the agenda cannot load", async () => {
  const view = renderCalendar(
    stubApi({
      agenda: () =>
        Promise.reject(new Error("You need to sign in before doing that.")),
    }),
  );

  expect(
    await view.findByText("You need to sign in before doing that."),
  ).toBeTruthy();
});
