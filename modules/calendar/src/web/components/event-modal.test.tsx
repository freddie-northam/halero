import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import {
  act,
  cleanup,
  fireEvent,
  type RenderResult,
  render,
  within,
} from "@testing-library/react";
import type { AgendaEvent } from "../../contract";
import type { CalendarEventInput, CalendarEventUpdateInput } from "../api";
import { formatTime } from "../helpers/format";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";
import { EventModal, type EventModalTarget } from "./event-modal";

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
  allDay: true,
  start: 0,
  end: 0,
  location: null,
  calendarId: "halero-local",
  recurring: false,
  notes: null,
  url: null,
  editable: true,
  ...seed,
});

interface Calls {
  readonly create: CalendarEventInput[];
  readonly update: CalendarEventUpdateInput[];
  readonly delete: string[];
}

const renderModal = (
  target: EventModalTarget,
  timeZone: string = HOME_TZ,
): { readonly view: RenderResult; readonly calls: Calls } => {
  const calls: Calls = { create: [], update: [], delete: [] };
  const view = render(
    <EventModal
      target={target}
      timeZone={timeZone}
      onClose={() => {}}
      onCreate={(input) => {
        calls.create.push(input);
        return Promise.resolve();
      }}
      onUpdate={(input) => {
        calls.update.push(input);
        return Promise.resolve();
      }}
      onDelete={(entityId) => {
        calls.delete.push(entityId);
        return Promise.resolve();
      }}
    />,
  );
  return { view, calls };
};

/** Clicking Save may go through the async run() wrapper, so this always
 * settles inside act, even on the (synchronous) validation-error paths. */
const save = async (view: RenderResult): Promise<void> => {
  await act(async () => {
    fireEvent.click(
      within(view.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
  });
};

test("create opens with all-day defaulted on and no time inputs", () => {
  const { view } = renderModal({ mode: "create", date: "2025-07-15" });
  const dialog = within(view.getByRole("dialog"));

  expect(dialog.getByText("New event")).toBeTruthy();
  expect(
    dialog
      .getByRole("checkbox", { name: "All day" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(dialog.queryByLabelText("Start time")).toBeNull();
});

test("entering a title and saving creates an all-day event on the target date", async () => {
  const { view, calls } = renderModal({ mode: "create", date: "2025-07-15" });
  const dialog = within(view.getByRole("dialog"));

  fireEvent.change(dialog.getByLabelText("Title"), {
    target: { value: "Team sync" },
  });
  await save(view);

  expect(calls.create).toEqual([
    { title: "Team sync", allDay: true, date: "2025-07-15" },
  ]);
});

test("toggling all-day off reveals time inputs and blocks save without them", async () => {
  const { view, calls } = renderModal({ mode: "create", date: "2025-07-15" });
  const dialog = within(view.getByRole("dialog"));

  fireEvent.click(dialog.getByRole("checkbox", { name: "All day" }));
  expect(dialog.getByLabelText("Start time")).toBeTruthy();
  expect(dialog.getByLabelText("End time")).toBeTruthy();

  fireEvent.change(dialog.getByLabelText("Title"), {
    target: { value: "Focus block" },
  });
  await save(view);

  expect(
    dialog.getByText("A timed event needs a start and end time."),
  ).toBeTruthy();
  expect(calls.create).toEqual([]);
});

test("a timed save sends startTime/endTime and omits endDate", async () => {
  const { view, calls } = renderModal({ mode: "create", date: "2025-07-15" });
  const dialog = within(view.getByRole("dialog"));

  fireEvent.click(dialog.getByRole("checkbox", { name: "All day" }));
  fireEvent.change(dialog.getByLabelText("Title"), {
    target: { value: "Focus block" },
  });
  fireEvent.change(dialog.getByLabelText("Start time"), {
    target: { value: "09:00" },
  });
  fireEvent.change(dialog.getByLabelText("End time"), {
    target: { value: "10:00" },
  });
  await save(view);

  expect(calls.create).toEqual([
    {
      title: "Focus block",
      allDay: false,
      date: "2025-07-15",
      startTime: "09:00",
      endTime: "10:00",
    },
  ]);
});

test("an end time at or before the start time is blocked with a readable message", async () => {
  const { view, calls } = renderModal({ mode: "create", date: "2025-07-15" });
  const dialog = within(view.getByRole("dialog"));

  fireEvent.click(dialog.getByRole("checkbox", { name: "All day" }));
  fireEvent.change(dialog.getByLabelText("Title"), {
    target: { value: "Focus block" },
  });
  fireEvent.change(dialog.getByLabelText("Start time"), {
    target: { value: "10:00" },
  });
  fireEvent.change(dialog.getByLabelText("End time"), {
    target: { value: "09:00" },
  });
  await save(view);

  expect(
    dialog.getByText("An event's end time must be after its start time."),
  ).toBeTruthy();
  expect(calls.create).toEqual([]);
});

test("a blank title is blocked", async () => {
  const { view, calls } = renderModal({ mode: "create", date: "2025-07-15" });
  await save(view);

  const dialog = within(view.getByRole("dialog"));
  expect(dialog.getByText("An event needs a title.")).toBeTruthy();
  expect(calls.create).toEqual([]);
});

test("edit prefills title, location, notes, and link", () => {
  const target: EventModalTarget = {
    mode: "edit",
    event: event({
      entityId: "ev-1",
      title: "Board sync",
      location: "Room 4",
      notes: "Bring slides",
      url: "https://example.com",
    }),
  };
  const { view } = renderModal(target);
  const dialog = within(view.getByRole("dialog"));

  expect(dialog.getByLabelText("Title")).toHaveProperty("value", "Board sync");
  expect(dialog.getByLabelText("Location")).toHaveProperty("value", "Room 4");
  expect(dialog.getByLabelText("Notes")).toHaveProperty(
    "value",
    "Bring slides",
  );
  expect(dialog.getByLabelText("Link")).toHaveProperty(
    "value",
    "https://example.com",
  );
});

test("edit prefills timed start/end from the home timezone", () => {
  const timedEvent = event({
    entityId: "ev-2",
    title: "Standup",
    allDay: false,
    start: Date.UTC(2025, 6, 2, 8, 30, 0),
    end: Date.UTC(2025, 6, 2, 8, 45, 0),
  });
  const { view } = renderModal({ mode: "edit", event: timedEvent });
  const dialog = within(view.getByRole("dialog"));

  expect(dialog.getByLabelText("Start time")).toHaveProperty(
    "value",
    formatTime(timedEvent.start, HOME_TZ),
  );
  expect(dialog.getByLabelText("End time")).toHaveProperty(
    "value",
    formatTime(timedEvent.end, HOME_TZ),
  );
});

test("edit prefills a multi-day all-day event's inclusive end date and preserves it on save", async () => {
  const multiDay = event({
    entityId: "ev-3",
    title: "Conference",
    allDay: true,
    start: Date.UTC(2025, 6, 10, 0, 0, 0),
    // Exclusive end; the inclusive last day is the 12th. UTC keeps the
    // epoch-to-date mapping exact for this fixture (the Europe/London
    // prefill offset is exercised by the timed-event test above).
    end: Date.UTC(2025, 6, 13, 0, 0, 0),
  });
  const { view, calls } = renderModal({ mode: "edit", event: multiDay }, "UTC");

  await save(view);

  expect(calls.update).toEqual([
    {
      entityId: "ev-3",
      title: "Conference",
      allDay: true,
      date: "2025-07-10",
      endDate: "2025-07-12",
    },
  ]);
});

test("edit prefills a single-day all-day event with a blank end date and saves without one", async () => {
  const singleDay = event({
    entityId: "ev-4",
    title: "Focus day",
    allDay: true,
    start: Date.UTC(2025, 6, 10, 0, 0, 0),
    end: Date.UTC(2025, 6, 11, 0, 0, 0),
  });
  const { view, calls } = renderModal(
    { mode: "edit", event: singleDay },
    "UTC",
  );

  await save(view);

  expect(calls.update).toEqual([
    {
      entityId: "ev-4",
      title: "Focus day",
      allDay: true,
      date: "2025-07-10",
    },
  ]);
  expect(Object.hasOwn(calls.update[0] as object, "endDate")).toBe(false);
});

test("clearing an optional field on edit omits it from the update payload", async () => {
  const target: EventModalTarget = {
    mode: "edit",
    event: event({
      entityId: "ev-6",
      title: "Board sync",
      location: "Room 4",
    }),
  };
  const { view, calls } = renderModal(target);
  const dialog = within(view.getByRole("dialog"));

  fireEvent.change(dialog.getByLabelText("Location"), {
    target: { value: "" },
  });
  await save(view);

  expect(calls.update).toHaveLength(1);
  expect(Object.hasOwn(calls.update[0] as object, "location")).toBe(false);
});

test("create mode shows no Delete button", () => {
  const { view } = renderModal({ mode: "create", date: "2025-07-15" });
  const dialog = within(view.getByRole("dialog"));

  expect(dialog.queryByRole("button", { name: "Delete" })).toBeNull();
});

test("Delete calls onDelete with the event's entityId", async () => {
  const target: EventModalTarget = {
    mode: "edit",
    event: event({ entityId: "ev-5", title: "Cancel me" }),
  };
  const { view, calls } = renderModal(target);
  const dialog = within(view.getByRole("dialog"));

  await act(async () => {
    fireEvent.click(dialog.getByRole("button", { name: "Delete" }));
  });

  expect(calls.delete).toEqual(["ev-5"]);
});
