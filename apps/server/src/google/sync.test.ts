import { describe, expect, test } from "bun:test";
import { encryptCredentials } from "@halero/core";
import {
  calendarEvents,
  connections,
  entities,
  externalRefs,
  syncCursors,
  syncRuns,
} from "@halero/db";
import { and, eq } from "drizzle-orm";
import { makeTestApp, type TestApp } from "../test-utils";
import { saveGoogleClient } from "./client-config";
import { GOOGLE_CONNECTOR_ID } from "./common";
import { type SyncEngineContext, syncConnection } from "./sync";

const CONNECTION_ID = "conn-1";
const ACCOUNT_KEY = "google-sub-1";

interface SeedOptions {
  readonly accessTokenExpiresAt?: number;
  readonly status?: string;
}

const seedConnection = (testApp: TestApp, options: SeedOptions = {}): void => {
  const { database, key, clock } = testApp;
  saveGoogleClient(database.db, key, {
    clientId: "1234-abc.apps.googleusercontent.com",
    clientSecret: "GOCSPX-super-secret-value",
  });
  database.db
    .insert(connections)
    .values({
      id: CONNECTION_ID,
      connectorId: GOOGLE_CONNECTOR_ID,
      displayName: "Google Calendar",
      config: JSON.stringify({
        email: "person@example.com",
        accountKey: ACCOUNT_KEY,
      }),
      credentialsEnc: Buffer.from(
        encryptCredentials(
          key,
          JSON.stringify({
            refreshToken: "1//refresh-a",
            accessToken: "ya29.valid",
            accessTokenExpiresAt:
              options.accessTokenExpiresAt ?? clock.value + 3_600_000,
          }),
        ),
      ),
      status: options.status ?? "active",
      nextSyncAt: clock.value,
      // Seeded stale so a successful run provably CLEARS it.
      lastError: "A previous sync failed.",
      createdAt: clock.value,
    })
    .run();
};

const engineContext = (
  testApp: TestApp,
  googleFetch: (input: string | URL, init?: RequestInit) => Promise<Response>,
): SyncEngineContext => ({
  database: testApp.database,
  key: testApp.key,
  now: () => testApp.clock.value,
  googleFetch,
});

interface GoogleCall {
  readonly url: URL;
  readonly init: RequestInit | undefined;
}

interface FakeGoogle {
  readonly calls: GoogleCall[];
  readonly fetchLike: (
    input: string | URL,
    init?: RequestInit,
  ) => Promise<Response>;
}

const makeFakeGoogle = (
  handler: (url: URL, init?: RequestInit) => Response | null,
): FakeGoogle => {
  const calls: GoogleCall[] = [];
  return {
    calls,
    fetchLike: (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      const response = handler(url, init);
      if (response === null) {
        throw new Error(`unexpected Google call: ${url.toString()}`);
      }
      return Promise.resolve(response);
    },
  };
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const calendarListPage = (ids: readonly string[]): Record<string, unknown> => ({
  items: ids.map((id) => ({ id, summary: id })),
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

const allDayEvent = (
  id: string,
  etag: string,
  summary: string,
): Record<string, unknown> => ({
  id,
  etag,
  status: "confirmed",
  summary,
  start: { date: "2025-07-01" },
  end: { date: "2025-07-02" },
});

const isCalendarList = (url: URL): boolean =>
  url.pathname === "/calendar/v3/users/me/calendarList";

const isEvents = (url: URL, calendarId: string): boolean =>
  url.pathname === `/calendar/v3/calendars/${calendarId}/events`;

const isTokenEndpoint = (url: URL): boolean =>
  url.hostname === "oauth2.googleapis.com" && url.pathname === "/token";

const getRef = (testApp: TestApp, externalId: string) =>
  testApp.database.db
    .select()
    .from(externalRefs)
    .where(eq(externalRefs.externalId, externalId))
    .get();

const getEntityFor = (testApp: TestApp, externalId: string) => {
  const ref = getRef(testApp, externalId);
  if (ref === undefined) {
    throw new Error(`expected an external ref for ${externalId}`);
  }
  const entity = testApp.database.db
    .select()
    .from(entities)
    .where(eq(entities.id, ref.entityId))
    .get();
  if (entity === undefined) {
    throw new Error(`expected an entity for ${externalId}`);
  }
  return entity;
};

const getSatelliteFor = (testApp: TestApp, externalId: string) => {
  const ref = getRef(testApp, externalId);
  if (ref === undefined) {
    throw new Error(`expected an external ref for ${externalId}`);
  }
  return testApp.database.db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.entityId, ref.entityId))
    .get();
};

const getCursor = (testApp: TestApp, stream: string) =>
  testApp.database.db
    .select()
    .from(syncCursors)
    .where(
      and(
        eq(syncCursors.connectionId, CONNECTION_ID),
        eq(syncCursors.stream, stream),
      ),
    )
    .get();

const getRuns = (testApp: TestApp) =>
  testApp.database.db.select().from(syncRuns).all();

const getConnection = (testApp: TestApp) => {
  const row = testApp.database.db
    .select()
    .from(connections)
    .where(eq(connections.id, CONNECTION_ID))
    .get();
  if (row === undefined) {
    throw new Error("expected the seeded connection to exist");
  }
  return row;
};

/** Initial two-page sync used as the baseline for the incremental tests. */
const runInitialSync = async (
  testApp: TestApp,
  options: { readonly items?: readonly Record<string, unknown>[] } = {},
) => {
  const items = options.items ?? [
    timedEvent("evt-1", '"e1-v1"', "Standup"),
    allDayEvent("evt-2", '"e2-v1"', "Conference"),
  ];
  const fake = makeFakeGoogle((url) => {
    if (isCalendarList(url)) {
      return json(calendarListPage(["primary"]));
    }
    if (isEvents(url, "primary")) {
      return json({ items, nextSyncToken: "sync-token-1" });
    }
    return null;
  });
  return syncConnection(engineContext(testApp, fake.fetchLike), CONNECTION_ID);
};

describe("syncConnection initial full sync", () => {
  test("walks two pages, stores entities, satellites, refs, and the cursor", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    const fake = makeFakeGoogle((url) => {
      if (isCalendarList(url)) {
        return json(calendarListPage(["primary"]));
      }
      if (!isEvents(url, "primary")) {
        return null;
      }
      if (url.searchParams.get("pageToken") === null) {
        return json({
          items: [
            timedEvent("evt-1", '"e1-v1"', "Standup"),
            allDayEvent("evt-2", '"e2-v1"', "Conference"),
          ],
          nextPageToken: "page-2",
        });
      }
      return json({
        items: [timedEvent("evt-3", '"e3-v1"', "Retro")],
        nextSyncToken: "sync-token-1",
      });
    });

    const summary = await syncConnection(
      engineContext(testApp, fake.fetchLike),
      CONNECTION_ID,
    );

    expect(summary).toEqual({
      status: "success",
      upserts: 3,
      deletes: 0,
      error: null,
    });

    // First events request is a full sync: timeMin one year back, expanded
    // recurrences, no syncToken.
    const firstEvents = fake.calls.find((call) =>
      isEvents(call.url, "primary"),
    );
    if (firstEvents === undefined) {
      throw new Error("expected an events request");
    }
    expect(firstEvents.url.searchParams.get("singleEvents")).toBe("true");
    expect(firstEvents.url.searchParams.get("syncToken")).toBeNull();
    expect(firstEvents.url.searchParams.get("timeMin")).toBe(
      new Date(testApp.clock.value - 365 * 86_400_000).toISOString(),
    );

    const entity = getEntityFor(testApp, "evt-1");
    expect(entity.kind).toBe("calendar.event");
    expect(entity.title).toBe("Standup");
    expect(getRef(testApp, "evt-1")?.version).toBe('"e1-v1"');
    expect(getSatelliteFor(testApp, "evt-2")?.allDay).toBe(1);
    expect(getSatelliteFor(testApp, "evt-2")?.endDate).toBe("2025-07-02");
    expect(getCursor(testApp, "primary")?.cursor).toBe("sync-token-1");

    const runs = getRuns(testApp);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("success");
    expect(runs[0]?.upserts).toBe(3);
    expect(runs[0]?.finishedAt).not.toBeNull();
    expect(getConnection(testApp).lastError).toBeNull();
  });

  test("keeps committed pages but stores no cursor when a later page fails", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    const fake = makeFakeGoogle((url) => {
      if (isCalendarList(url)) {
        return json(calendarListPage(["primary"]));
      }
      if (!isEvents(url, "primary")) {
        return null;
      }
      if (url.searchParams.get("pageToken") === null) {
        return json({
          items: [timedEvent("evt-1", '"e1-v1"', "Standup")],
          nextPageToken: "page-2",
        });
      }
      return new Response("boom", { status: 500 });
    });

    const summary = await syncConnection(
      engineContext(testApp, fake.fetchLike),
      CONNECTION_ID,
    );

    expect(summary.status).toBe("failed");
    expect(summary.error).toContain("Google Calendar");
    // Page one committed on its own; the stream cursor must not exist.
    expect(getEntityFor(testApp, "evt-1").title).toBe("Standup");
    expect(getCursor(testApp, "primary")).toBeUndefined();
    const run = getRuns(testApp)[0];
    expect(run?.status).toBe("failed");
    expect(run?.upserts).toBe(1);
    expect(run?.finishedAt).not.toBeNull();
    expect(getConnection(testApp).lastError).toBe(summary.error ?? "");
  });

  test("records committed work from every stream when a later stream fails", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    const fake = makeFakeGoogle((url) => {
      if (isCalendarList(url)) {
        return json(calendarListPage(["alpha", "beta"]));
      }
      if (isEvents(url, "alpha")) {
        return json({
          items: [
            timedEvent("evt-a1", '"a1-v1"', "Alpha one"),
            timedEvent("evt-a2", '"a2-v1"', "Alpha two"),
          ],
          nextSyncToken: "alpha-sync-1",
        });
      }
      if (!isEvents(url, "beta")) {
        return null;
      }
      if (url.searchParams.get("pageToken") === null) {
        return json({
          items: [timedEvent("evt-b1", '"b1-v1"', "Beta one")],
          nextPageToken: "beta-page-2",
        });
      }
      return new Response("boom", { status: 500 });
    });

    const summary = await syncConnection(
      engineContext(testApp, fake.fetchLike),
      CONNECTION_ID,
    );

    // Pinned contract: sync_runs counts record ALL work committed during
    // the run at page granularity, regardless of the run's outcome.
    // Stream alpha (2 events) plus beta's first page (1 event) committed.
    expect(summary.status).toBe("failed");
    expect(summary.upserts).toBe(3);
    expect(summary.deletes).toBe(0);
    const run = getRuns(testApp)[0];
    expect(run?.status).toBe("failed");
    expect(run?.upserts).toBe(3);
    expect(run?.deletes).toBe(0);
    expect(getCursor(testApp, "alpha")?.cursor).toBe("alpha-sync-1");
    expect(getCursor(testApp, "beta")).toBeUndefined();
  });
});

describe("syncConnection incremental sync", () => {
  const incrementalFake = (
    respond: (url: URL) => Response | null,
  ): ReturnType<typeof makeFakeGoogle> =>
    makeFakeGoogle((url) => {
      if (isCalendarList(url)) {
        return json(calendarListPage(["primary"]));
      }
      if (isEvents(url, "primary")) {
        return respond(url);
      }
      return null;
    });

  test("applies a changed event and advances the cursor", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    await runInitialSync(testApp);
    const fake = incrementalFake((url) => {
      expect(url.searchParams.get("syncToken")).toBe("sync-token-1");
      expect(url.searchParams.get("timeMin")).toBeNull();
      return json({
        items: [timedEvent("evt-1", '"e1-v2"', "Standup (moved room)")],
        nextSyncToken: "sync-token-2",
      });
    });

    const summary = await syncConnection(
      engineContext(testApp, fake.fetchLike),
      CONNECTION_ID,
    );

    expect(summary).toEqual({
      status: "success",
      upserts: 1,
      deletes: 0,
      error: null,
    });
    expect(getEntityFor(testApp, "evt-1").title).toBe("Standup (moved room)");
    expect(getRef(testApp, "evt-1")?.version).toBe('"e1-v2"');
    expect(getCursor(testApp, "primary")?.cursor).toBe("sync-token-2");
  });

  test("leaves the spine untouched when the etag is unchanged", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    await runInitialSync(testApp);
    const before = getEntityFor(testApp, "evt-1");
    const fake = incrementalFake(() =>
      json({
        // Same etag, different payload: the version-equal short-circuit
        // must win and never touch the spine.
        items: [timedEvent("evt-1", '"e1-v1"', "A title that must not land")],
        nextSyncToken: "sync-token-2",
      }),
    );

    const summary = await syncConnection(
      engineContext(testApp, fake.fetchLike),
      CONNECTION_ID,
    );

    expect(summary.upserts).toBe(0);
    const after = getEntityFor(testApp, "evt-1");
    expect(after.title).toBe("Standup");
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  test("tombstones a cancelled event on its own calendar", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    await runInitialSync(testApp);
    const fake = incrementalFake(() =>
      json({
        items: [{ id: "evt-2", etag: '"e2-v2"', status: "cancelled" }],
        nextSyncToken: "sync-token-2",
      }),
    );

    const summary = await syncConnection(
      engineContext(testApp, fake.fetchLike),
      CONNECTION_ID,
    );

    expect(summary.deletes).toBe(1);
    expect(getEntityFor(testApp, "evt-2").deletedAt).not.toBeNull();
    // The other event is untouched.
    expect(getEntityFor(testApp, "evt-1").deletedAt).toBeNull();
  });

  test("does not tombstone when the event moved to another calendar", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    // Initial state: evt-9 lives on the "work" calendar.
    const initial = makeFakeGoogle((url) => {
      if (isCalendarList(url)) {
        return json(calendarListPage(["work", "primary"]));
      }
      if (isEvents(url, "work")) {
        return json({
          items: [timedEvent("evt-9", '"e9-v1"', "Planning")],
          nextSyncToken: "work-sync-1",
        });
      }
      if (isEvents(url, "primary")) {
        return json({ items: [], nextSyncToken: "primary-sync-1" });
      }
      return null;
    });
    await syncConnection(
      engineContext(testApp, initial.fetchLike),
      CONNECTION_ID,
    );

    // Now "primary" (the OLD calendar of a moved event) reports it
    // cancelled while its satellite already points at "work": the move
    // must win over the tombstone.
    const second = makeFakeGoogle((url) => {
      if (isCalendarList(url)) {
        return json(calendarListPage(["work", "primary"]));
      }
      if (isEvents(url, "work")) {
        return json({
          items: [timedEvent("evt-9", '"e9-v1"', "Planning")],
          nextSyncToken: "work-sync-2",
        });
      }
      if (isEvents(url, "primary")) {
        return json({
          items: [{ id: "evt-9", etag: '"e9-v2"', status: "cancelled" }],
          nextSyncToken: "primary-sync-2",
        });
      }
      return null;
    });

    const summary = await syncConnection(
      engineContext(testApp, second.fetchLike),
      CONNECTION_ID,
    );

    expect(summary.deletes).toBe(0);
    expect(getEntityFor(testApp, "evt-9").deletedAt).toBeNull();
    expect(getSatelliteFor(testApp, "evt-9")?.calendarId).toBe("work");
  });
});

describe("syncConnection 410 full resync", () => {
  test("resyncs, sweeps vanished events, spares live ones, replaces cursor", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    await runInitialSync(testApp);
    // The sweep compares external_refs.last_seen_at (entity-store clock,
    // Date.now) with the resync start; give them room to differ.
    await Bun.sleep(5);

    const fake = makeFakeGoogle((url) => {
      if (isCalendarList(url)) {
        return json(calendarListPage(["primary"]));
      }
      if (!isEvents(url, "primary")) {
        return null;
      }
      if (url.searchParams.get("syncToken") === "sync-token-1") {
        return new Response("Gone", { status: 410 });
      }
      // Full resync: evt-1 is still there (same etag), evt-2 vanished.
      expect(url.searchParams.get("timeMin")).not.toBeNull();
      return json({
        items: [timedEvent("evt-1", '"e1-v1"', "Standup")],
        nextSyncToken: "sync-token-3",
      });
    });

    const summary = await syncConnection(
      engineContext(testApp, fake.fetchLike),
      CONNECTION_ID,
    );

    expect(summary.status).toBe("success");
    expect(summary.deletes).toBe(1);
    // evt-1 was version-equal (unchanged) but got its last_seen_at bumped,
    // which is exactly what spares it from the sweep.
    expect(getEntityFor(testApp, "evt-1").deletedAt).toBeNull();
    expect(getEntityFor(testApp, "evt-2").deletedAt).not.toBeNull();
    expect(getCursor(testApp, "primary")?.cursor).toBe("sync-token-3");
  });
});

describe("syncConnection token handling", () => {
  test("retries once with a forced refresh after a 401 mid-sync", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    let eventsCalls = 0;
    const fake = makeFakeGoogle((url, init) => {
      if (isTokenEndpoint(url)) {
        return json({
          access_token: "ya29.fresh",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      if (isCalendarList(url)) {
        return json(calendarListPage(["primary"]));
      }
      if (!isEvents(url, "primary")) {
        return null;
      }
      eventsCalls += 1;
      if (eventsCalls === 1) {
        return new Response("Unauthorized", { status: 401 });
      }
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer ya29.fresh");
      return json({
        items: [timedEvent("evt-1", '"e1-v1"', "Standup")],
        nextSyncToken: "sync-token-1",
      });
    });

    const summary = await syncConnection(
      engineContext(testApp, fake.fetchLike),
      CONNECTION_ID,
    );

    expect(summary.status).toBe("success");
    expect(summary.upserts).toBe(1);
    expect(eventsCalls).toBe(2);
    expect(fake.calls.filter((call) => isTokenEndpoint(call.url))).toHaveLength(
      1,
    );
  });

  test("fails the run readably and stops when the refresh token is dead", async () => {
    const testApp = makeTestApp();
    // Expired access token forces a refresh straight away.
    seedConnection(testApp, {
      accessTokenExpiresAt: 1_700_000_000_000 - 1,
    });
    const fake = makeFakeGoogle((url) => {
      if (isTokenEndpoint(url)) {
        return json({ error: "invalid_grant" }, 400);
      }
      return null;
    });

    const summary = await syncConnection(
      engineContext(testApp, fake.fetchLike),
      CONNECTION_ID,
    );

    expect(summary.status).toBe("failed");
    expect(summary.error).toContain("econnect");
    expect(summary.error).not.toContain("1//refresh-a");
    expect(getConnection(testApp).status).toBe("reauth_required");
    expect(getConnection(testApp).lastError).toBe(summary.error ?? "");
    const run = getRuns(testApp)[0];
    expect(run?.status).toBe("failed");
    expect(run?.finishedAt).not.toBeNull();
  });
});

describe("syncConnection guards", () => {
  test("rejects readably before starting a run when reauth is required", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp, { status: "reauth_required" });
    const fake = makeFakeGoogle(() => null);

    const outcome = await syncConnection(
      engineContext(testApp, fake.fetchLike),
      CONNECTION_ID,
    ).then(
      () => null,
      (error: unknown) => error,
    );

    if (!(outcome instanceof Error)) {
      throw new Error("expected syncConnection to reject");
    }
    expect(outcome.message).toContain("econnect");
    expect(getRuns(testApp)).toHaveLength(0);
    expect(fake.calls).toHaveLength(0);
  });

  test("rejects readably when the connection does not exist", async () => {
    const testApp = makeTestApp();
    const fake = makeFakeGoogle(() => null);

    const outcome = await syncConnection(
      engineContext(testApp, fake.fetchLike),
      "missing",
    ).then(
      () => null,
      (error: unknown) => error,
    );

    if (!(outcome instanceof Error)) {
      throw new Error("expected syncConnection to reject");
    }
    expect(outcome.message).toContain("Settings");
  });
});
