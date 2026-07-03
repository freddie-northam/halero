import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { AgendaEvent } from "../../contract";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";
import { EventChip } from "./event-chip";

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
  calendarId: "primary",
  recurring: false,
  notes: null,
  url: null,
  editable: false,
  ...seed,
});

test("a user (editable) event renders the accent dot and is clickable", () => {
  const userEvent = event({
    entityId: "ev-user",
    title: "1:1",
    editable: true,
  });
  const clicks: AgendaEvent[] = [];
  const view = render(
    <EventChip
      event={userEvent}
      timeZone={HOME_TZ}
      onEdit={(clickedEvent) => clicks.push(clickedEvent)}
    />,
  );

  const chip = view.getByRole("button", { name: /1:1/ });
  expect(chip.querySelector("span.rounded-full")).not.toBeNull();

  fireEvent.click(chip);
  expect(clicks).toEqual([userEvent]);
});

test("a Google (non-editable) event stays a static, inert element with no accent dot", () => {
  const googleEvent = event({ entityId: "ev-google", title: "Dentist" });
  const onEdit = () => {
    throw new Error("should never be called");
  };
  const view = render(
    <EventChip event={googleEvent} timeZone={HOME_TZ} onEdit={onEdit} />,
  );

  expect(view.queryByRole("button")).toBeNull();
  const chip = view.getByText("Dentist").closest("div");
  expect(chip?.querySelector("span.rounded-full")).toBeNull();
});

test("stopping propagation: clicking an editable chip does not bubble to a wrapping day click", () => {
  const userEvent = event({
    entityId: "ev-user",
    title: "1:1",
    editable: true,
  });
  let dayClicked = false;
  const view = render(
    // biome-ignore lint/a11y/noStaticElementInteractions: test-only wrapper, not real UI
    // biome-ignore lint/a11y/useKeyWithClickEvents: test-only wrapper, not real UI
    <div
      onClick={() => {
        dayClicked = true;
      }}
    >
      <EventChip event={userEvent} timeZone={HOME_TZ} onEdit={() => {}} />
    </div>,
  );

  fireEvent.click(view.getByRole("button", { name: /1:1/ }));
  expect(dayClicked).toBe(false);
});
