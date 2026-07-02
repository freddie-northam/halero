import { describe, expect, test } from "bun:test";
import {
  createFixtureFetch,
  jsonResponse,
  PROTOCOL_VERSION,
  ResyncRequired,
  runConnectorFixture,
  syncOpsPageSchema,
} from "@halero/connector-sdk";
import { CALENDAR_EVENT_KIND } from "@halero/schemas";
import { googleCalendarConnector } from "./connector";

const CONFIG = { homeTimezone: "Europe/London" };
const NOW = 1_700_000_000_000;

const calendarListPage = (
  ids: readonly string[],
  nextPageToken?: string,
): Record<string, unknown> => ({
  items: ids.map((id) => ({ id, summary: `Calendar ${id}` })),
  ...(nextPageToken === undefined ? {} : { nextPageToken }),
});

const timedEvent = (
  id: string,
  etag: string,
  summary: string,
): Record<string, unknown> => ({
  id,
  etag,
  status: "confirmed",
  summary,
  start: { dateTime: "2025-07-02T09:30:00+01:00" },
  end: { dateTime: "2025-07-02T09:45:00+01:00" },
});

const isCalendarList = (url: URL): boolean =>
  url.pathname === "/calendar/v3/users/me/calendarList";

const isEvents = (url: URL, calendarId: string): boolean =>
  url.pathname === `/calendar/v3/calendars/${calendarId}/events`;

describe("googleCalendarConnector manifest and auth", () => {
  test("declares protocol 1, oauth2+poll, and calendar.event@1", () => {
    const { manifest } = googleCalendarConnector;

    expect(manifest.id).toBe("google-calendar");
    expect(manifest.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(manifest.capabilities).toEqual(["oauth2", "poll"]);
    expect(manifest.produces).toEqual([
      { kind: CALENDAR_EVENT_KIND, schemaVersion: 1 },
    ]);
  });

  test("declares offline access and forced consent as auth params", () => {
    const { auth } = googleCalendarConnector;

    expect(auth.authorizationEndpoint).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(auth.tokenEndpoint).toBe("https://oauth2.googleapis.com/token");
    expect(auth.scopes.join(" ")).toBe(
      "openid email https://www.googleapis.com/auth/calendar.readonly",
    );
    expect(auth.extraAuthParams).toEqual({
      access_type: "offline",
      prompt: "consent",
    });
  });
});

describe("googleCalendarConnector.identify", () => {
  test("keys the account to the id_token sub and carries the email", () => {
    const identity = googleCalendarConnector.identify({
      sub: "google-sub-1",
      email: "person@example.com",
    });

    expect(identity).toEqual({
      accountKey: "google-sub-1",
      displayEmail: "person@example.com",
    });
  });

  test("returns null when the claims carry no sub", () => {
    expect(googleCalendarConnector.identify({ email: "x@y.z" })).toBeNull();
  });
});

describe("googleCalendarConnector full sync", () => {
  test("discovers calendars across pages and walks a paged full sync", async () => {
    const fixture = createFixtureFetch((url) => {
      if (isCalendarList(url) && url.searchParams.get("pageToken") === null) {
        return jsonResponse(calendarListPage(["primary"], "cal-page-2"));
      }
      if (isCalendarList(url)) {
        return jsonResponse(calendarListPage(["work"]));
      }
      if (isEvents(url, "primary")) {
        if (url.searchParams.get("pageToken") === null) {
          return jsonResponse({
            items: [
              timedEvent("evt-1", '"e1-v1"', "Standup"),
              timedEvent("evt-2", '"e2-v1"', "Review"),
            ],
            nextPageToken: "page-2",
          });
        }
        return jsonResponse({
          items: [timedEvent("evt-3", '"e3-v1"', "Retro")],
          nextSyncToken: "sync-token-1",
        });
      }
      if (isEvents(url, "work")) {
        return jsonResponse({ items: [], nextSyncToken: "work-sync-1" });
      }
      return null;
    });

    const run = await runConnectorFixture({
      connector: googleCalendarConnector,
      config: CONFIG,
      fetch: fixture.fetch,
      now: () => NOW,
    });

    expect(run.streams.map((s) => s.stream)).toEqual([
      { id: "primary", displayName: "Calendar primary" },
      { id: "work", displayName: "Calendar work" },
    ]);
    const primary = run.streams[0];
    expect(primary?.pages.map((page) => page.length)).toEqual([2, 1]);
    expect(primary?.nextCursor).toBe("sync-token-1");
    expect(run.streams[1]?.nextCursor).toBe("work-sync-1");

    // The full sync request: one-year lookback, expanded recurrences,
    // capped page size, and no syncToken.
    const firstEvents = fixture.calls.find((call) =>
      isEvents(call.url, "primary"),
    );
    expect(firstEvents?.url.searchParams.get("timeMin")).toBe(
      new Date(NOW - 365 * 86_400_000).toISOString(),
    );
    expect(firstEvents?.url.searchParams.get("singleEvents")).toBe("true");
    expect(firstEvents?.url.searchParams.get("maxResults")).toBe("2500");
    expect(firstEvents?.url.searchParams.get("syncToken")).toBeNull();
  });

  test("every yielded page satisfies the protocol schema", async () => {
    const fixture = createFixtureFetch((url) => {
      if (isCalendarList(url)) {
        return jsonResponse(calendarListPage(["primary"]));
      }
      if (isEvents(url, "primary")) {
        return jsonResponse({
          items: [
            timedEvent("evt-1", '"e1-v1"', "Standup"),
            { id: "evt-2", etag: '"e2-v9"', status: "cancelled" },
            { status: "confirmed" },
          ],
          nextSyncToken: "sync-token-1",
        });
      }
      return null;
    });

    const run = await runConnectorFixture({
      connector: googleCalendarConnector,
      config: CONFIG,
      fetch: fixture.fetch,
      now: () => NOW,
    });

    const page = run.streams[0]?.pages[0] ?? [];
    // The id-less item is dropped; the cancelled one becomes a delete.
    expect(page.map((op) => op.op)).toEqual(["upsert", "delete"]);
    expect(() => syncOpsPageSchema.parse(page)).not.toThrow();
  });

  test("a 410 during the full sync fails plainly instead of looping resyncs", async () => {
    const fixture = createFixtureFetch((url) => {
      if (isCalendarList(url)) {
        return jsonResponse(calendarListPage(["primary"]));
      }
      if (isEvents(url, "primary")) {
        return new Response("Gone", { status: 410 });
      }
      return null;
    });

    const outcome = await runConnectorFixture({
      connector: googleCalendarConnector,
      config: CONFIG,
      fetch: fixture.fetch,
      now: () => NOW,
    }).then(
      () => null,
      (error: unknown) => error,
    );

    if (!(outcome instanceof Error)) {
      throw new Error("expected the fixture run to reject");
    }
    expect(outcome).not.toBeInstanceOf(ResyncRequired);
    expect(outcome.message).toContain("410");
  });

  test("a missing nextSyncToken on the last page fails readably", async () => {
    const fixture = createFixtureFetch((url) => {
      if (isCalendarList(url)) {
        return jsonResponse(calendarListPage(["primary"]));
      }
      if (isEvents(url, "primary")) {
        return jsonResponse({ items: [] });
      }
      return null;
    });

    const outcome = await runConnectorFixture({
      connector: googleCalendarConnector,
      config: CONFIG,
      fetch: fixture.fetch,
      now: () => NOW,
    }).then(
      () => null,
      (error: unknown) => error,
    );

    if (!(outcome instanceof Error)) {
      throw new Error("expected the fixture run to reject");
    }
    expect(outcome.message).toContain("sync token");
  });
});

describe("googleCalendarConnector incremental sync", () => {
  test("uses the cursor as syncToken and returns the replacement", async () => {
    const fixture = createFixtureFetch((url) => {
      if (isCalendarList(url)) {
        return jsonResponse(calendarListPage(["primary"]));
      }
      if (isEvents(url, "primary")) {
        expect(url.searchParams.get("syncToken")).toBe("sync-token-1");
        expect(url.searchParams.get("timeMin")).toBeNull();
        return jsonResponse({
          items: [timedEvent("evt-1", '"e1-v2"', "Standup (moved)")],
          nextSyncToken: "sync-token-2",
        });
      }
      return null;
    });

    const run = await runConnectorFixture({
      connector: googleCalendarConnector,
      config: CONFIG,
      fetch: fixture.fetch,
      now: () => NOW,
      cursors: { primary: "sync-token-1" },
    });

    expect(run.streams[0]?.pages).toHaveLength(1);
    expect(run.streams[0]?.nextCursor).toBe("sync-token-2");
  });

  test("throws ResyncRequired when Google expires the sync token", async () => {
    const fixture = createFixtureFetch((url) => {
      if (isCalendarList(url)) {
        return jsonResponse(calendarListPage(["primary"]));
      }
      if (isEvents(url, "primary")) {
        return new Response("Gone", { status: 410 });
      }
      return null;
    });

    const outcome = await runConnectorFixture({
      connector: googleCalendarConnector,
      config: CONFIG,
      fetch: fixture.fetch,
      now: () => NOW,
      cursors: { primary: "sync-token-1" },
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(ResyncRequired);
  });
});
