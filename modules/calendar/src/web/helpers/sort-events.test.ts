import { describe, expect, test } from "bun:test";
import type { AgendaEvent } from "../../contract";
import { sortEvents } from "./sort-events";

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

describe("sortEvents by start", () => {
  const events = [
    event({ entityId: "b", start: 200 }),
    event({ entityId: "a", start: 100 }),
    event({ entityId: "c", start: 300 }),
  ];

  test("ascending orders by the numeric epoch", () => {
    expect(
      sortEvents(events, { column: "start", direction: "asc" }).map(
        (e) => e.entityId,
      ),
    ).toEqual(["a", "b", "c"]);
  });

  test("descending reverses the order", () => {
    expect(
      sortEvents(events, { column: "start", direction: "desc" }).map(
        (e) => e.entityId,
      ),
    ).toEqual(["c", "b", "a"]);
  });

  test("does not mutate the input array", () => {
    const original = [...events];
    sortEvents(events, { column: "start", direction: "desc" });
    expect(events).toEqual(original);
  });
});

describe("sortEvents by title", () => {
  const events = [
    event({ entityId: "b", title: "Beta" }),
    event({ entityId: "a", title: "Alpha" }),
    event({ entityId: "c", title: "Charlie" }),
  ];

  test("ascending uses localeCompare", () => {
    expect(
      sortEvents(events, { column: "title", direction: "asc" }).map(
        (e) => e.entityId,
      ),
    ).toEqual(["a", "b", "c"]);
  });

  test("descending reverses the order", () => {
    expect(
      sortEvents(events, { column: "title", direction: "desc" }).map(
        (e) => e.entityId,
      ),
    ).toEqual(["c", "b", "a"]);
  });
});

describe("sortEvents by location", () => {
  const events = [
    event({ entityId: "no-location-1", location: null }),
    event({ entityId: "b", location: "Beta room" }),
    event({ entityId: "no-location-2", location: null }),
    event({ entityId: "a", location: "Alpha room" }),
  ];

  test("ascending sorts located events, with location-less ones last", () => {
    expect(
      sortEvents(events, { column: "location", direction: "asc" }).map(
        (e) => e.entityId,
      ),
    ).toEqual(["a", "b", "no-location-1", "no-location-2"]);
  });

  test("descending still keeps location-less events last", () => {
    expect(
      sortEvents(events, { column: "location", direction: "desc" }).map(
        (e) => e.entityId,
      ),
    ).toEqual(["b", "a", "no-location-1", "no-location-2"]);
  });
});

describe("sortEvents stability", () => {
  test("equal keys keep their original relative order, ascending and descending", () => {
    const events = [
      event({ entityId: "first", start: 100 }),
      event({ entityId: "second", start: 100 }),
      event({ entityId: "third", start: 100 }),
    ];

    expect(
      sortEvents(events, { column: "start", direction: "asc" }).map(
        (e) => e.entityId,
      ),
    ).toEqual(["first", "second", "third"]);
    expect(
      sortEvents(events, { column: "start", direction: "desc" }).map(
        (e) => e.entityId,
      ),
    ).toEqual(["first", "second", "third"]);
  });

  test("equal locations keep their original relative order in both directions", () => {
    const events = [
      event({ entityId: "first", location: "Same room" }),
      event({ entityId: "second", location: "Same room" }),
    ];

    expect(
      sortEvents(events, { column: "location", direction: "asc" }).map(
        (e) => e.entityId,
      ),
    ).toEqual(["first", "second"]);
    expect(
      sortEvents(events, { column: "location", direction: "desc" }).map(
        (e) => e.entityId,
      ),
    ).toEqual(["first", "second"]);
  });
});
