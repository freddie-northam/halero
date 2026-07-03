import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  render,
  within,
} from "@testing-library/react";
import type {
  AgendaDay,
  AgendaEvent,
  CalendarEventList,
  CalendarRange,
} from "../contract";
import type { CalendarApi, CalendarEventInput } from "./api";
import { createCalendarScreen } from "./calendar-screen";
import { normalizeCalendarSearch } from "./helpers/calendar-search";
import { registerHappyDom, unregisterHappyDom } from "./test/happy-dom";

beforeAll(() => {
  registerHappyDom();
});
afterEach(cleanup);
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await unregisterHappyDom();
});

const HOME_TZ = "Europe/London";
const TODAY = "2025-07-02";

interface EventSeed {
  readonly entityId: string;
  readonly title: string;
  readonly allDay?: boolean;
  readonly start: number;
  readonly end: number;
  readonly location?: string;
  readonly recurring?: boolean;
}

const event = (seed: EventSeed): AgendaEvent => ({
  entityId: seed.entityId,
  title: seed.title,
  allDay: seed.allDay ?? false,
  start: seed.start,
  end: seed.end,
  location: seed.location ?? null,
  calendarId: "primary",
  recurring: seed.recurring ?? false,
  notes: null,
  url: null,
  editable: false,
});

// 2025-07-02 is a Wednesday; London is on BST (UTC+1) in July.
const fixtureDays: readonly AgendaDay[] = [
  {
    date: TODAY,
    events: [
      event({
        entityId: "ev-allday",
        title: "Conference",
        allDay: true,
        start: Date.UTC(2025, 6, 1, 23, 0, 0),
        end: Date.UTC(2025, 6, 2, 23, 0, 0),
      }),
      event({
        entityId: "ev-standup",
        title: "Standup",
        start: Date.UTC(2025, 6, 2, 8, 30, 0),
        end: Date.UTC(2025, 6, 2, 8, 45, 0),
        location: "Meeting room 2",
        recurring: true,
      }),
    ],
  },
  {
    date: "2025-07-10",
    events: [1, 2, 3, 4, 5].map((index) =>
      event({
        entityId: `ev-busy-${index}`,
        title: `Busy slot ${index}`,
        start: Date.UTC(2025, 6, 10, 8 + index, 0, 0),
        end: Date.UTC(2025, 6, 10, 8 + index, 30, 0),
      }),
    ),
  },
];

/** The flat, deduplicated feed the list view fetches instead of `range`. */
const fixtureEvents: readonly AgendaEvent[] = fixtureDays.flatMap(
  (day) => day.events,
);

/** Serves any requested window from the fixture, like the server would. */
const fixtureApi: CalendarApi = {
  today: () => Promise.resolve({ homeTimezone: HOME_TZ, today: TODAY }),
  range: (from, to) =>
    Promise.resolve<CalendarRange>({
      homeTimezone: HOME_TZ,
      days: fixtureDays.filter((day) => day.date >= from && day.date < to),
    }),
  events: () =>
    Promise.resolve<CalendarEventList>({
      homeTimezone: HOME_TZ,
      events: fixtureEvents,
    }),
  upcoming: () => Promise.resolve({ homeTimezone: HOME_TZ, events: [] }),
  createEvent: () => Promise.reject(new Error("not under test")),
  updateEvent: () => Promise.reject(new Error("not under test")),
  deleteEvent: () => Promise.reject(new Error("not under test")),
};

const renderCalendar = async (api: CalendarApi, url: string) => {
  const rootRoute = createRootRoute();
  const calendarRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/calendar",
    validateSearch: normalizeCalendarSearch,
    component: createCalendarScreen(api),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([calendarRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  // Settling the router before mounting keeps its internal post-render
  // state updates out of React's act() warnings.
  await router.load();
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { view, router };
};

const searchOf = (router: { state: { location: { search: unknown } } }) =>
  normalizeCalendarSearch(router.state.location.search);

/** The context panel is the page's one "Event details" landmark. */
const contextPanel = (view: ReturnType<typeof render>) =>
  within(view.getByRole("complementary", { name: "Event details" }));

test("defaults to the agenda anchored on the server's today", async () => {
  const { view } = await renderCalendar(fixtureApi, "/calendar");

  expect(await view.findByText("Wednesday 2 July")).toBeTruthy();
  expect(view.getByText("all day")).toBeTruthy();
  // 08:30Z rendered in Europe/London (BST) is 09:30.
  expect(view.getByText(/09:30/)).toBeTruthy();
  expect(view.getByText("Meeting room 2")).toBeTruthy();
  const agendaTab = view.getByRole("tab", { name: "Agenda" });
  expect(agendaTab.getAttribute("aria-selected")).toBe("true");
});

test("the switcher changes the view and writes it into the URL", async () => {
  const { view, router } = await renderCalendar(fixtureApi, "/calendar");
  await view.findByText("Wednesday 2 July");

  const monthTab = view.getByRole("tab", { name: "Month" });
  fireEvent.mouseDown(monthTab, { button: 0 });
  fireEvent.click(monthTab);

  expect(await view.findByText("July 2025")).toBeTruthy();
  expect(searchOf(router).view).toBe("month");
  expect(
    view.getByRole("tab", { name: "Month" }).getAttribute("aria-selected"),
  ).toBe("true");
});

test("URL state round-trips: a month URL renders the month grid directly", async () => {
  const { view, router } = await renderCalendar(
    fixtureApi,
    "/calendar?view=month&date=2025-07-02",
  );

  expect(await view.findByText("July 2025")).toBeTruthy();
  // The busy day shows 3 chips and the overflow affordance.
  expect(await view.findByText("Busy slot 1")).toBeTruthy();
  expect(view.getByText("Busy slot 3")).toBeTruthy();
  expect(view.queryByText("Busy slot 4")).toBeNull();
  expect(view.getByText("+2 more")).toBeTruthy();
  expect(searchOf(router)).toEqual({ view: "month", date: "2025-07-02" });
});

test("today's month cell carries the accent ring marker", async () => {
  const { view } = await renderCalendar(
    fixtureApi,
    "/calendar?view=month&date=2025-07-02",
  );
  await view.findByText("July 2025");

  const todayCell = view.container.querySelector('[aria-current="date"]');
  expect(todayCell).not.toBeNull();
  expect(todayCell?.textContent).toContain("2");
});

test("+N more switches to that day's agenda", async () => {
  const { view, router } = await renderCalendar(
    fixtureApi,
    "/calendar?view=month&date=2025-07-02",
  );
  await view.findByText("+2 more");

  fireEvent.click(view.getByText("+2 more"));

  expect(await view.findByText("Thursday 10 July")).toBeTruthy();
  expect(searchOf(router)).toEqual({ view: "agenda", date: "2025-07-10" });
  expect(view.getByText("Busy slot 5")).toBeTruthy();
});

test("week view puts all-day events above timed ones and marks recurrence", async () => {
  const { view } = await renderCalendar(
    fixtureApi,
    "/calendar?view=week&date=2025-07-02",
  );

  const conference = await view.findByText("Conference");
  const standup = view.getByText("Standup");
  // DOCUMENT_POSITION_FOLLOWING: the timed event comes after the all-day one.
  expect(conference.compareDocumentPosition(standup) & 4).toBe(4);
  // The weekly standup is a recurring instance.
  expect(view.getAllByLabelText("Repeats").length).toBeGreaterThan(0);
});

test("shows the empty state when the window has no events", async () => {
  const emptyApi: CalendarApi = {
    ...fixtureApi,
    range: () => Promise.resolve({ homeTimezone: HOME_TZ, days: [] }),
  };
  const { view } = await renderCalendar(emptyApi, "/calendar");

  expect(await view.findByText("No events in these 7 days.")).toBeTruthy();
});

test("shows a readable error when the range cannot load", async () => {
  const failingApi: CalendarApi = {
    ...fixtureApi,
    range: () =>
      Promise.reject(new Error("You need to sign in before doing that.")),
  };
  const { view } = await renderCalendar(failingApi, "/calendar");

  expect(
    await view.findByText("You need to sign in before doing that."),
  ).toBeTruthy();
});

test("a failed range does not strand the list view behind a stale error", async () => {
  const failingRangeApi: CalendarApi = {
    ...fixtureApi,
    range: () =>
      Promise.reject(new Error("You need to sign in before doing that.")),
  };
  const { view } = await renderCalendar(
    failingRangeApi,
    "/calendar?view=month",
  );
  await view.findByText("You need to sign in before doing that.");

  const listTab = view.getByRole("tab", { name: "List" });
  fireEvent.mouseDown(listTab, { button: 0 });
  fireEvent.click(listTab);

  // The list feed loads fine; the disabled range query's frozen error
  // must not keep blocking the view it no longer drives.
  expect(await view.findByRole("table")).toBeTruthy();
  expect(view.queryByText("You need to sign in before doing that.")).toBeNull();
});

test("the New event button opens the create modal at the anchor and closes on success", async () => {
  const calls: CalendarEventInput[] = [];
  const api: CalendarApi = {
    ...fixtureApi,
    createEvent: (input) => {
      calls.push(input);
      return Promise.resolve({
        entityId: "ev-new",
        title: input.title,
        allDay: input.allDay,
        start: 0,
        end: 0,
        location: null,
        calendarId: "halero-local",
        recurring: false,
        notes: null,
        url: null,
        editable: true,
      });
    },
  };
  const { view } = await renderCalendar(
    api,
    "/calendar?view=month&date=2025-07-02",
  );
  await view.findByText("July 2025");

  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "New event" }));
  });
  const dialog = within(await view.findByRole("dialog"));
  expect(dialog.getByText("New event")).toBeTruthy();

  fireEvent.change(view.getByLabelText("Title"), {
    target: { value: "Team sync" },
  });
  await act(async () => {
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
  });

  expect(calls).toEqual([
    { title: "Team sync", allDay: true, date: "2025-07-02" },
  ]);
  // Flushes the dialog's exit-animation state update (Radix Presence),
  // which lands a tick after the click's own act() settles.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(view.queryByRole("dialog")).toBeNull();
});

test("clicking a user event's chip selects it into the panel; its Edit button opens the modal", async () => {
  const editableEvent = event({
    entityId: "ev-user",
    title: "1:1 with Sam",
    allDay: true,
    start: Date.UTC(2025, 6, 2, 23, 0, 0),
    end: Date.UTC(2025, 6, 3, 23, 0, 0),
  });
  const api: CalendarApi = {
    ...fixtureApi,
    range: () =>
      Promise.resolve<CalendarRange>({
        homeTimezone: HOME_TZ,
        days: [{ date: TODAY, events: [{ ...editableEvent, editable: true }] }],
      }),
  };
  const { view } = await renderCalendar(
    api,
    "/calendar?view=month&date=2025-07-02",
  );
  await view.findByText("July 2025");

  fireEvent.click(view.getByTitle("1:1 with Sam"));

  const panel = contextPanel(view);
  expect(panel.getByText("Selected")).toBeTruthy();
  expect(panel.getAllByText("1:1 with Sam").length).toBeGreaterThan(0);
  expect(view.queryByRole("dialog")).toBeNull();

  await act(async () => {
    fireEvent.click(panel.getByRole("button", { name: "Edit" }));
  });
  const dialog = within(await view.findByRole("dialog"));
  expect(dialog.getByText("Edit event")).toBeTruthy();
});

test("saving an edit opened from the panel calls updateEvent and closes the modal", async () => {
  const editableEvent = event({
    entityId: "ev-user",
    title: "1:1 with Sam",
    allDay: true,
    start: Date.UTC(2025, 6, 2, 23, 0, 0),
    end: Date.UTC(2025, 6, 3, 23, 0, 0),
  });
  const calls: unknown[] = [];
  const api: CalendarApi = {
    ...fixtureApi,
    range: () =>
      Promise.resolve<CalendarRange>({
        homeTimezone: HOME_TZ,
        days: [{ date: TODAY, events: [{ ...editableEvent, editable: true }] }],
      }),
    updateEvent: (input) => {
      calls.push(input);
      return Promise.resolve({ ...editableEvent, editable: true });
    },
  };
  const { view } = await renderCalendar(
    api,
    "/calendar?view=month&date=2025-07-02",
  );
  await view.findByText("July 2025");

  fireEvent.click(view.getByTitle("1:1 with Sam"));
  await act(async () => {
    fireEvent.click(contextPanel(view).getByRole("button", { name: "Edit" }));
  });
  const dialog = within(await view.findByRole("dialog"));
  expect(dialog.getByText("Edit event")).toBeTruthy();

  await act(async () => {
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
  });

  expect(calls).toHaveLength(1);
  // Flushes the dialog's exit-animation state update (Radix Presence),
  // which lands a tick after the click's own act() settles.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(view.queryByRole("dialog")).toBeNull();
});

test("deleting from an edit modal opened from the panel calls deleteEvent, closes it, and clears the selection", async () => {
  const editableEvent = event({
    entityId: "ev-user",
    title: "1:1 with Sam",
    allDay: true,
    start: Date.UTC(2025, 6, 2, 23, 0, 0),
    end: Date.UTC(2025, 6, 3, 23, 0, 0),
  });
  const deletes: string[] = [];
  const api: CalendarApi = {
    ...fixtureApi,
    range: () =>
      Promise.resolve<CalendarRange>({
        homeTimezone: HOME_TZ,
        days: [{ date: TODAY, events: [{ ...editableEvent, editable: true }] }],
      }),
    deleteEvent: (entityId) => {
      deletes.push(entityId);
      return Promise.resolve({ entityId });
    },
  };
  const { view } = await renderCalendar(
    api,
    "/calendar?view=month&date=2025-07-02",
  );
  await view.findByText("July 2025");

  fireEvent.click(view.getByTitle("1:1 with Sam"));
  const panel = contextPanel(view);
  expect(panel.getByText("Selected")).toBeTruthy();

  await act(async () => {
    fireEvent.click(panel.getByRole("button", { name: "Edit" }));
  });
  const dialog = within(await view.findByRole("dialog"));
  expect(dialog.getByText("Edit event")).toBeTruthy();

  await act(async () => {
    fireEvent.click(dialog.getByRole("button", { name: "Delete" }));
  });

  expect(deletes).toEqual(["ev-user"]);
  // Flushes the dialog's exit-animation state update (Radix Presence),
  // which lands a tick after the click's own act() settles.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(view.queryByRole("dialog")).toBeNull();
  expect(panel.queryByText("Selected")).toBeNull();
});

test("clicking a Google event selects it into the panel with no Edit button", async () => {
  const googleEvent = event({
    entityId: "ev-google",
    title: "Dentist",
    start: Date.UTC(2025, 6, 2, 8, 30, 0),
    end: Date.UTC(2025, 6, 2, 8, 45, 0),
  });
  const api: CalendarApi = {
    ...fixtureApi,
    range: () =>
      Promise.resolve<CalendarRange>({
        homeTimezone: HOME_TZ,
        days: [{ date: TODAY, events: [googleEvent] }],
      }),
  };
  const { view } = await renderCalendar(
    api,
    "/calendar?view=month&date=2025-07-02",
  );
  await view.findByText("July 2025");

  fireEvent.click(view.getByTitle("Dentist"));

  const panel = contextPanel(view);
  expect(panel.getByText("Selected")).toBeTruthy();
  expect(panel.getAllByText("Dentist").length).toBeGreaterThan(0);
  expect(panel.queryByRole("button", { name: "Edit" })).toBeNull();
});

test("clearing the selection removes the Selected section from the panel", async () => {
  const editableEvent = event({
    entityId: "ev-user",
    title: "1:1 with Sam",
    allDay: true,
    start: Date.UTC(2025, 6, 2, 23, 0, 0),
    end: Date.UTC(2025, 6, 3, 23, 0, 0),
  });
  const api: CalendarApi = {
    ...fixtureApi,
    range: () =>
      Promise.resolve<CalendarRange>({
        homeTimezone: HOME_TZ,
        days: [{ date: TODAY, events: [{ ...editableEvent, editable: true }] }],
      }),
  };
  const { view } = await renderCalendar(
    api,
    "/calendar?view=month&date=2025-07-02",
  );
  await view.findByText("July 2025");

  fireEvent.click(view.getByTitle("1:1 with Sam"));
  const panel = contextPanel(view);
  expect(panel.getByText("Selected")).toBeTruthy();

  fireEvent.click(panel.getByRole("button", { name: "Clear selection" }));

  expect(panel.queryByText("Selected")).toBeNull();
});

test("the panel's Next up card shows the soonest upcoming event", async () => {
  const upcomingEvent = event({
    entityId: "ev-upcoming",
    title: "Board sync",
    start: Date.UTC(2025, 6, 4, 9, 0, 0),
    end: Date.UTC(2025, 6, 4, 9, 30, 0),
  });
  const api: CalendarApi = {
    ...fixtureApi,
    upcoming: () =>
      Promise.resolve({ homeTimezone: HOME_TZ, events: [upcomingEvent] }),
  };
  const { view } = await renderCalendar(api, "/calendar");
  await view.findByText("Wednesday 2 July");

  const panel = contextPanel(view);
  expect(await panel.findByText("Board sync")).toBeTruthy();
});

test("the panel shows Nothing coming up when there is no upcoming event", async () => {
  const { view } = await renderCalendar(fixtureApi, "/calendar");
  await view.findByText("Wednesday 2 July");

  expect(
    await contextPanel(view).findByText("Nothing coming up."),
  ).toBeTruthy();
});

test("an upcoming fetch error does not hide the calendar", async () => {
  const api: CalendarApi = {
    ...fixtureApi,
    upcoming: () => Promise.reject(new Error("boom")),
  };
  const { view } = await renderCalendar(api, "/calendar");

  expect(await view.findByText("Wednesday 2 July")).toBeTruthy();
  expect(
    await contextPanel(view).findByText("Nothing coming up."),
  ).toBeTruthy();
});

test("the list view fetches via api.events and renders the table; range is not fetched", async () => {
  let rangeCalls = 0;
  let eventsCalls = 0;
  const api: CalendarApi = {
    ...fixtureApi,
    range: (from, to) => {
      rangeCalls += 1;
      return fixtureApi.range(from, to);
    },
    events: (from, to) => {
      eventsCalls += 1;
      return fixtureApi.events(from, to);
    },
  };
  const { view, router } = await renderCalendar(
    api,
    "/calendar?view=list&date=2025-07-02",
  );

  expect(await view.findByRole("table")).toBeTruthy();
  expect(view.getByText("Standup")).toBeTruthy();
  expect(searchOf(router)).toEqual({ view: "list", date: "2025-07-02" });
  const listTab = view.getByRole("tab", { name: "List" });
  expect(listTab.getAttribute("aria-selected")).toBe("true");
  expect(rangeCalls).toBe(0);
  expect(eventsCalls).toBeGreaterThan(0);
});

test("the other views never fetch the flat events feed", async () => {
  let eventsCalls = 0;
  const api: CalendarApi = {
    ...fixtureApi,
    events: (from, to) => {
      eventsCalls += 1;
      return fixtureApi.events(from, to);
    },
  };
  const { view } = await renderCalendar(
    api,
    "/calendar?view=month&date=2025-07-02",
  );
  await view.findByText("July 2025");

  expect(eventsCalls).toBe(0);
});

test("the list view's empty state renders when the feed has no events", async () => {
  const emptyApi: CalendarApi = {
    ...fixtureApi,
    events: () => Promise.resolve({ homeTimezone: HOME_TZ, events: [] }),
  };
  const { view } = await renderCalendar(emptyApi, "/calendar?view=list");

  expect(await view.findByText("No events this month.")).toBeTruthy();
});

test("selecting a user event from the list view and clicking Edit opens the modal and saves", async () => {
  const editableEvent = event({
    entityId: "ev-user",
    title: "1:1 with Sam",
    start: Date.UTC(2025, 6, 2, 8, 0, 0),
    end: Date.UTC(2025, 6, 2, 9, 0, 0),
  });
  const calls: unknown[] = [];
  const api: CalendarApi = {
    ...fixtureApi,
    events: () =>
      Promise.resolve<CalendarEventList>({
        homeTimezone: HOME_TZ,
        events: [{ ...editableEvent, editable: true }],
      }),
    updateEvent: (input) => {
      calls.push(input);
      return Promise.resolve({ ...editableEvent, editable: true });
    },
  };
  const { view } = await renderCalendar(
    api,
    "/calendar?view=list&date=2025-07-02",
  );

  fireEvent.click(await view.findByRole("button", { name: /1:1 with Sam/ }));
  const panel = contextPanel(view);
  expect(panel.getByText("Selected")).toBeTruthy();

  await act(async () => {
    fireEvent.click(panel.getByRole("button", { name: "Edit" }));
  });
  const dialog = within(await view.findByRole("dialog"));
  expect(dialog.getByText("Edit event")).toBeTruthy();

  await act(async () => {
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
  });

  expect(calls).toHaveLength(1);
  // Flushes the dialog's exit-animation state update (Radix Presence),
  // which lands a tick after the click's own act() settles.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(view.queryByRole("dialog")).toBeNull();
});
