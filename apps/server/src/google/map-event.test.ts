import { describe, expect, test } from "bun:test";
import { CALENDAR_EVENT_KIND } from "@halero/schemas";
import { mapGoogleEvent, UNTITLED_EVENT_TITLE } from "./map-event";

const HOME_TZ = "Europe/London";

const timedEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "evt-timed-1",
  etag: '"3387270000000000"',
  status: "confirmed",
  summary: "Standup",
  description: "Daily sync call",
  location: "Meeting room 2",
  start: { dateTime: "2025-07-02T09:30:00+01:00" },
  end: { dateTime: "2025-07-02T09:45:00+01:00" },
  ...overrides,
});

const expectUpsert = (mapped: ReturnType<typeof mapGoogleEvent>) => {
  if (mapped === null || mapped.kind !== "upsert") {
    throw new Error("expected an upsert mapping");
  }
  return mapped;
};

describe("mapGoogleEvent", () => {
  test("maps a timed event straight from the API dateTimes", () => {
    const mapped = expectUpsert(
      mapGoogleEvent(timedEvent(), "primary", HOME_TZ),
    );

    expect(mapped.externalId).toBe("evt-timed-1");
    expect(mapped.etag).toBe('"3387270000000000"');
    expect(mapped.spine.kind).toBe(CALENDAR_EVENT_KIND);
    expect(mapped.spine.title).toBe("Standup");
    expect(mapped.spine.snippet).toBe("Daily sync call");
    expect(mapped.spine.occurredStart).toBe(
      Date.parse("2025-07-02T09:30:00+01:00"),
    );
    expect(mapped.spine.occurredEnd).toBe(
      Date.parse("2025-07-02T09:45:00+01:00"),
    );
    expect(mapped.satellite.calendarId).toBe("primary");
    expect(mapped.satellite.allDay).toBe(0);
    expect(mapped.satellite.startDate).toBeNull();
    expect(mapped.satellite.endDate).toBeNull();
    expect(mapped.satellite.location).toBe("Meeting room 2");
    expect(mapped.satellite.status).toBe("confirmed");
    expect(JSON.parse(mapped.satellite.raw).id).toBe("evt-timed-1");
  });

  test("maps an all-day event, preserving Google's exclusive end date", () => {
    const mapped = expectUpsert(
      mapGoogleEvent(
        timedEvent({
          id: "evt-allday-1",
          summary: "Conference",
          start: { date: "2025-07-01" },
          end: { date: "2025-07-03" },
        }),
        "primary",
        HOME_TZ,
      ),
    );

    expect(mapped.satellite.allDay).toBe(1);
    // Stored exactly as Google sent them; end stays EXCLUSIVE.
    expect(mapped.satellite.startDate).toBe("2025-07-01");
    expect(mapped.satellite.endDate).toBe("2025-07-03");
    // Spine bounds are home-timezone midnights (London is BST, UTC+1).
    expect(mapped.spine.occurredStart).toBe(Date.UTC(2025, 5, 30, 23, 0, 0));
    expect(mapped.spine.occurredEnd).toBe(Date.UTC(2025, 6, 2, 23, 0, 0));
  });

  test("falls back to a placeholder title for untitled events", () => {
    const mapped = expectUpsert(
      mapGoogleEvent(
        timedEvent({ summary: undefined, description: undefined }),
        "primary",
        HOME_TZ,
      ),
    );

    expect(mapped.spine.title).toBe(UNTITLED_EVENT_TITLE);
    expect(mapped.spine.snippet).toBeNull();
  });

  test("truncates long descriptions to 280 characters", () => {
    const mapped = expectUpsert(
      mapGoogleEvent(
        timedEvent({ description: "x".repeat(500) }),
        "primary",
        HOME_TZ,
      ),
    );

    expect(mapped.spine.snippet).toBe("x".repeat(280));
  });

  test("carries recurring-instance fields into the satellite", () => {
    const mapped = expectUpsert(
      mapGoogleEvent(
        timedEvent({
          id: "evt-rec-1_20250702T083000Z",
          recurringEventId: "evt-rec-1",
          originalStartTime: { dateTime: "2025-07-02T09:30:00+01:00" },
        }),
        "primary",
        HOME_TZ,
      ),
    );

    expect(mapped.satellite.recurringEventId).toBe("evt-rec-1");
    expect(mapped.satellite.originalStartTime).toBe(
      "2025-07-02T09:30:00+01:00",
    );
  });

  test("maps a cancelled item to a cancellation, not an upsert", () => {
    // Cancelled items arrive stripped down to little more than id+status.
    const mapped = mapGoogleEvent(
      { id: "evt-timed-1", etag: '"999"', status: "cancelled" },
      "primary",
      HOME_TZ,
    );

    expect(mapped).toEqual({ kind: "cancelled", externalId: "evt-timed-1" });
  });

  test("returns null for an item without an id", () => {
    expect(mapGoogleEvent({ status: "confirmed" }, "primary", HOME_TZ)).toBe(
      null,
    );
  });
});
