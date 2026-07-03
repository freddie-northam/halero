import { describe, expect, test } from "bun:test";
import {
  defineConnector,
  type SyncOp,
  type SyncStreamResult,
} from "@halero/connector-sdk";
import { encryptCredentials } from "@halero/core";
import {
  calendarEvents,
  connections,
  entities,
  externalRefs,
  syncCursors,
  syncRuns,
} from "@halero/db";
import {
  buildKindRegistry,
  defineServerModule,
} from "@halero/module-sdk/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { kindRegistry } from "../registry";
import { makeTestApp, type TestApp } from "../test-utils";
import { saveGoogleClient } from "./client-config";
import { GOOGLE_CONNECTOR_ID } from "./connection";
import { type SyncEngineContext, syncConnection } from "./engine";
import { type AnyConnector, registerConnectors } from "./registry";

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
  outboundFetch: (input: string | URL, init?: RequestInit) => Promise<Response>,
): SyncEngineContext => ({
  database: testApp.database,
  key: testApp.key,
  now: () => testApp.clock.value,
  outboundFetch,
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

/** Starts long before the one-year replay window (test clock is Nov 2023). */
const ancientEvent = (
  id: string,
  etag: string,
  summary: string,
): Record<string, unknown> => ({
  id,
  etag,
  status: "confirmed",
  summary,
  start: { dateTime: "2020-01-01T09:30:00Z" },
  end: { dateTime: "2020-01-01T10:00:00Z" },
});

/** A protocol-valid calendar.event upsert; occurredStart is optional. */
const calendarOp = (externalId: string, occurredStart?: number): SyncOp => ({
  op: "upsert",
  externalId,
  version: `"${externalId}-v1"`,
  spine: {
    kind: "calendar.event",
    schemaVersion: 1,
    title: externalId,
    ...(occurredStart === undefined ? {} : { occurredStart }),
  },
  satellite: {
    calendarId: "primary",
    allDay: 0,
    startDate: null,
    endDate: null,
    location: null,
    status: "confirmed",
    recurringEventId: null,
    originalStartTime: null,
  },
  raw: { id: externalId },
});

/**
 * Registered under the Google id so the seeded connection resolves it;
 * yields the given pages and returns exactly the given stream result,
 * so tests control the cursor and the declared replay window.
 */
const replayConnector = (
  pages: SyncOp[][],
  result: SyncStreamResult,
): AnyConnector =>
  defineConnector({
    manifest: {
      id: GOOGLE_CONNECTOR_ID,
      version: "0.0.1",
      protocolVersion: 1,
      capabilities: ["poll"],
      produces: [{ kind: "calendar.event", schemaVersion: 1 }],
    },
    auth: {
      kind: "oauth2",
      authorizationEndpoint: "https://example.com/auth",
      tokenEndpoint: "https://example.com/token",
      scopes: ["readonly"],
    },
    configSchema: z.object({}),
    identify: () => null,
    discoverStreams: () => Promise.resolve([{ id: "primary" }]),
    sync: async function* () {
      for (const page of pages) {
        yield page;
      }
      return result;
    },
  });

const replayContext = (
  testApp: TestApp,
  pages: SyncOp[][],
  result: SyncStreamResult,
): SyncEngineContext => ({
  database: testApp.database,
  key: testApp.key,
  now: () => testApp.clock.value,
  outboundFetch: () => Promise.reject(new Error("no network expected")),
  registry: registerConnectors([replayConnector(pages, result)], kindRegistry),
  log: () => undefined,
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
    // the run at chunk granularity, regardless of the run's outcome.
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

describe("syncConnection raw persistence", () => {
  test("persists the raw provider event so it parses back verbatim", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    const source = timedEvent("evt-1", '"e1-v1"', "Standup");

    await runInitialSync(testApp, { items: [source] });

    const satellite = getSatelliteFor(testApp, "evt-1");
    expect(JSON.parse(satellite?.raw ?? "null")).toEqual(source);
  });
});

describe("syncConnection connector misbehavior", () => {
  const VALID_OP: SyncOp = {
    op: "upsert",
    externalId: "evt-ok",
    version: '"ok-v1"',
    spine: { kind: "calendar.event", schemaVersion: 1, title: "Committed" },
    satellite: {
      calendarId: "primary",
      allDay: 0,
      startDate: null,
      endDate: null,
      location: null,
      status: "confirmed",
      recurringEventId: null,
      originalStartTime: null,
    },
    raw: { id: "evt-ok" },
  };

  /** Registered under the Google id so the seeded connection resolves it. */
  const rogueConnector = (pages: SyncOp[][]): AnyConnector =>
    defineConnector({
      manifest: {
        id: GOOGLE_CONNECTOR_ID,
        version: "0.0.1",
        protocolVersion: 1,
        capabilities: ["poll"],
        produces: [{ kind: "calendar.event", schemaVersion: 1 }],
      },
      auth: {
        kind: "oauth2",
        authorizationEndpoint: "https://example.com/auth",
        tokenEndpoint: "https://example.com/token",
        scopes: ["readonly"],
      },
      configSchema: z.object({}),
      identify: () => null,
      discoverStreams: () => Promise.resolve([{ id: "primary" }]),
      sync: async function* () {
        for (const page of pages) {
          yield page;
        }
        return { nextCursor: "rogue-cursor" };
      },
    });

  const rogueContext = (
    testApp: TestApp,
    pages: SyncOp[][],
    logs: string[],
  ): SyncEngineContext => ({
    database: testApp.database,
    key: testApp.key,
    now: () => testApp.clock.value,
    outboundFetch: () => Promise.reject(new Error("no network expected")),
    // Even injected registries pass registration validation; the rogue
    // connector's manifest is honest, only its runtime output misbehaves.
    registry: registerConnectors([rogueConnector(pages)], kindRegistry),
    log: (message) => logs.push(message),
  });

  test("fails readably on an invalid ops page but keeps committed pages", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    const invalidPage: SyncOp[] = [
      {
        op: "upsert",
        externalId: "evt-bad",
        spine: { kind: "calendar.event", schemaVersion: 1 },
        satellite: { seen: new Date() },
      },
    ];
    const logs: string[] = [];

    const summary = await syncConnection(
      rogueContext(testApp, [[VALID_OP], invalidPage], logs),
      CONNECTION_ID,
    );

    expect(summary.status).toBe("failed");
    expect(summary.error).toContain("could not understand");
    // The first page committed on its own and its work is reported
    // (pinned RunCounts contract); the stream cursor must not exist.
    expect(summary.upserts).toBe(1);
    expect(getEntityFor(testApp, "evt-ok").title).toBe("Committed");
    expect(getCursor(testApp, "primary")).toBeUndefined();
    const run = getRuns(testApp)[0];
    expect(run?.status).toBe("failed");
    expect(run?.upserts).toBe(1);
    // The zod detail reaches the log so connector authors can diagnose.
    expect(logs.join("\n")).toContain("Rejected a sync ops page");
  });

  test("fails readably when the connector produces an unknown kind", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    const unknownKindPage: SyncOp[] = [
      {
        op: "upsert",
        externalId: "evt-w",
        spine: { kind: "widget.gadget", schemaVersion: 1 },
        satellite: { anything: true },
      },
    ];
    const logs: string[] = [];

    const summary = await syncConnection(
      rogueContext(testApp, [unknownKindPage], logs),
      CONNECTION_ID,
    );

    expect(summary.status).toBe("failed");
    expect(summary.error).toContain("widget.gadget");
    // The page's transaction rolled back: nothing committed, no counts.
    expect(summary.upserts).toBe(0);
    expect(getRef(testApp, "evt-w")).toBeUndefined();
  });

  test("fails readably when a satellite does not match the registered kind schema", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    // JSON-valid (so the page passes the protocol schema) but the wrong
    // shape for the registered calendar.event schema.
    const garbagePage: SyncOp[] = [
      {
        op: "upsert",
        externalId: "evt-garbage",
        spine: { kind: "calendar.event", schemaVersion: 1, title: "Bad" },
        satellite: { calendarId: 7, allDay: "yes" },
      },
    ];
    const logs: string[] = [];

    const summary = await syncConnection(
      rogueContext(testApp, [garbagePage], logs),
      CONNECTION_ID,
    );

    // The host enforces the registered schema; the message names the
    // connector and the kind so a self-hoster knows which side is broken.
    expect(summary.status).toBe("failed");
    expect(summary.error).toContain(GOOGLE_CONNECTOR_ID);
    expect(summary.error).toContain("calendar.event");
    expect(summary.error).toContain("registered shape");
    // The page transaction rolled back: no ref, no satellite row, no counts.
    expect(summary.upserts).toBe(0);
    expect(getRef(testApp, "evt-garbage")).toBeUndefined();
    expect(testApp.database.db.select().from(calendarEvents).all()).toEqual([]);
    // The zod detail reaches the log so connector authors can diagnose.
    expect(logs.join("\n")).toContain("satellite payload");
  });
});

describe("syncConnection stream provenance", () => {
  test("records the stream that saw each ref", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);

    await runInitialSync(testApp);

    expect(getRef(testApp, "evt-1")?.stream).toBe("primary");
    expect(getRef(testApp, "evt-2")?.stream).toBe("primary");
  });

  test("the delete guard follows the ref's stream, not the satellite", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
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
    expect(getRef(testApp, "evt-9")?.stream).toBe("work");
    // Corrupt the satellite so it CLAIMS the event lives on "primary".
    // The guard must ignore it: provenance lives on the ref now.
    const ref = getRef(testApp, "evt-9");
    if (ref === undefined) {
      throw new Error("expected a ref for evt-9");
    }
    testApp.database.db
      .update(calendarEvents)
      .set({ calendarId: "primary" })
      .where(eq(calendarEvents.entityId, ref.entityId))
      .run();

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

describe("syncConnection windowed replay sweep", () => {
  test("a 410 resync spares unchanged events older than the replay window", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    // evt-old predates the one-year lookback; evt-1 and evt-2 are inside.
    await runInitialSync(testApp, {
      items: [
        ancientEvent("evt-old", '"old-v1"', "History"),
        timedEvent("evt-1", '"e1-v1"', "Standup"),
        timedEvent("evt-2", '"e2-v1"', "Conference"),
      ],
    });
    // The sweep compares external_refs.last_seen_at (entity-store clock,
    // Date.now) with the replay start; give them room to differ.
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
      // Windowed full replay: evt-1 is unchanged inside the window,
      // evt-2 vanished inside the window, and evt-old sits beyond the
      // one-year lookback so Google never re-yields it.
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
    // The event OLDER than the window must survive: the replay never
    // covered it, so its absence from the replay proves nothing.
    expect(getEntityFor(testApp, "evt-old").deletedAt).toBeNull();
    expect(getEntityFor(testApp, "evt-1").deletedAt).toBeNull();
    expect(getEntityFor(testApp, "evt-2").deletedAt).not.toBeNull();
    expect(getCursor(testApp, "primary")?.cursor).toBe("sync-token-3");
  });

  test("a cursorless retry after an interrupted initial sync sweeps deletions", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    // First attempt: page one (evt-1, evt-2) commits, page two fails, so
    // no cursor is stored and the next run replays from scratch.
    const first = makeFakeGoogle((url) => {
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
            timedEvent("evt-2", '"e2-v1"', "Conference"),
          ],
          nextPageToken: "page-2",
        });
      }
      return new Response("boom", { status: 500 });
    });
    const interrupted = await syncConnection(
      engineContext(testApp, first.fetchLike),
      CONNECTION_ID,
    );
    expect(interrupted.status).toBe("failed");
    expect(getCursor(testApp, "primary")).toBeUndefined();
    await Bun.sleep(5);

    // The retry is still cursorless; evt-2 was deleted upstream meanwhile
    // and lies inside the replay window, so the sweep must catch it.
    const retry = makeFakeGoogle((url) => {
      if (isCalendarList(url)) {
        return json(calendarListPage(["primary"]));
      }
      if (!isEvents(url, "primary")) {
        return null;
      }
      return json({
        items: [timedEvent("evt-1", '"e1-v1"', "Standup")],
        nextSyncToken: "sync-token-1",
      });
    });

    const summary = await syncConnection(
      engineContext(testApp, retry.fetchLike),
      CONNECTION_ID,
    );

    expect(summary.status).toBe("success");
    expect(summary.deletes).toBe(1);
    expect(getEntityFor(testApp, "evt-1").deletedAt).toBeNull();
    expect(getEntityFor(testApp, "evt-2").deletedAt).not.toBeNull();
    expect(getCursor(testApp, "primary")?.cursor).toBe("sync-token-1");
  });

  test("a cursorless run after a crash-after-clearCursor sweeps", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    await runInitialSync(testApp);
    // Simulate the crash window: a 410 handler cleared the cursor and
    // the process died before the replay could run.
    testApp.database.db
      .delete(syncCursors)
      .where(eq(syncCursors.connectionId, CONNECTION_ID))
      .run();
    await Bun.sleep(5);

    const fake = makeFakeGoogle((url) => {
      if (isCalendarList(url)) {
        return json(calendarListPage(["primary"]));
      }
      if (!isEvents(url, "primary")) {
        return null;
      }
      return json({
        items: [timedEvent("evt-1", '"e1-v1"', "Standup")],
        nextSyncToken: "sync-token-9",
      });
    });

    const summary = await syncConnection(
      engineContext(testApp, fake.fetchLike),
      CONNECTION_ID,
    );

    expect(summary.status).toBe("success");
    expect(summary.deletes).toBe(1);
    expect(getEntityFor(testApp, "evt-2").deletedAt).not.toBeNull();
    expect(getCursor(testApp, "primary")?.cursor).toBe("sync-token-9");
  });

  test("an unwindowed replay sweeps every stale ref, dated or not", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    // First cursorless run creates the refs; its own sweep is a natural
    // no-op because every ref was just seen.
    const first = await syncConnection(
      replayContext(
        testApp,
        [
          [
            calendarOp("evt-dated", 1_600_000_000_000),
            calendarOp("evt-undated"),
          ],
        ],
        {},
      ),
      CONNECTION_ID,
    );
    expect(first).toEqual({
      status: "success",
      upserts: 2,
      deletes: 0,
      error: null,
    });
    await Bun.sleep(5);

    // The next replay yields nothing and declares NO window: it claims
    // to have covered everything, so both stale refs are swept.
    const summary = await syncConnection(
      replayContext(testApp, [[]], {}),
      CONNECTION_ID,
    );

    expect(summary.status).toBe("success");
    expect(summary.deletes).toBe(2);
    expect(getEntityFor(testApp, "evt-dated").deletedAt).not.toBeNull();
    expect(getEntityFor(testApp, "evt-undated").deletedAt).not.toBeNull();
  });

  test("a windowed replay never sweeps refs with a NULL occurred_start", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    const windowStart = 1_690_000_000_000;
    const first = await syncConnection(
      replayContext(
        testApp,
        [
          [
            calendarOp("evt-inside", windowStart + 1_000),
            calendarOp("evt-undated"),
          ],
        ],
        {},
      ),
      CONNECTION_ID,
    );
    expect(first.upserts).toBe(2);
    await Bun.sleep(5);

    const summary = await syncConnection(
      replayContext(testApp, [[]], { replayWindowStart: windowStart }),
      CONNECTION_ID,
    );

    // evt-inside vanished inside the declared window: swept. The undated
    // ref cannot be placed inside the window, so it must survive.
    expect(summary.status).toBe("success");
    expect(summary.deletes).toBe(1);
    expect(getEntityFor(testApp, "evt-inside").deletedAt).not.toBeNull();
    expect(getEntityFor(testApp, "evt-undated").deletedAt).toBeNull();
  });
});

describe("syncConnection write budget", () => {
  test("a mid-page failure keeps the committed chunks' rows and counts", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    // One 251-op page: the first 250 fill a whole chunk, the 251st (an
    // unknown kind) lands in the second chunk and fails it.
    const ops: SyncOp[] = Array.from({ length: 250 }, (_, index) =>
      calendarOp(`evt-${index}`),
    );
    ops.push({
      op: "upsert",
      externalId: "evt-bad",
      spine: { kind: "widget.unknown", schemaVersion: 1 },
    });

    const summary = await syncConnection(
      replayContext(testApp, [ops], {}),
      CONNECTION_ID,
    );

    expect(summary.status).toBe("failed");
    expect(summary.error).toContain("widget.unknown");
    // The first chunk committed on its own and its work is reported
    // (committed-work contract); the failing chunk rolled back alone.
    expect(summary.upserts).toBe(250);
    expect(getRef(testApp, "evt-0")).not.toBeUndefined();
    expect(getRef(testApp, "evt-249")).not.toBeUndefined();
    expect(getRef(testApp, "evt-bad")).toBeUndefined();
    const run = getRuns(testApp)[0];
    expect(run?.status).toBe("failed");
    expect(run?.upserts).toBe(250);
  });

  test("yields to the event loop between chunk commits inside one page", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    // A concurrent counter task stands in for pending HTTP work: it can
    // only advance when the sync engine yields back to the event loop.
    let timerTicks = 0;
    let stopPump = false;
    const startPump = async (): Promise<void> => {
      while (!stopPump) {
        timerTicks += 1;
        await Bun.sleep(0);
      }
    };
    const ticksAtOp: number[] = [];
    const tickModule = defineServerModule({
      id: "ticks",
      version: "0.0.1",
      entityKinds: [
        {
          kind: "tick.item",
          schemaVersion: 1,
          schema: z.object({}),
          satelliteWriter: () => {
            ticksAtOp.push(timerTicks);
          },
        },
      ],
    });
    const kinds = buildKindRegistry([tickModule]);
    const ops: SyncOp[] = Array.from({ length: 500 }, (_, index) => ({
      op: "upsert",
      externalId: `tick-${index}`,
      spine: { kind: "tick.item", schemaVersion: 1, title: `Tick ${index}` },
      satellite: {},
    }));
    const tickConnector: AnyConnector = defineConnector({
      manifest: {
        id: GOOGLE_CONNECTOR_ID,
        version: "0.0.1",
        protocolVersion: 1,
        capabilities: ["poll"],
        produces: [{ kind: "tick.item", schemaVersion: 1 }],
      },
      auth: {
        kind: "oauth2",
        authorizationEndpoint: "https://example.com/auth",
        tokenEndpoint: "https://example.com/token",
        scopes: ["readonly"],
      },
      configSchema: z.object({}),
      identify: () => null,
      discoverStreams: () => Promise.resolve([{ id: "primary" }]),
      sync: async function* () {
        yield ops;
        return {};
      },
    });
    const context: SyncEngineContext = {
      database: testApp.database,
      key: testApp.key,
      now: () => testApp.clock.value,
      outboundFetch: () => Promise.reject(new Error("no network expected")),
      registry: registerConnectors([tickConnector], kinds),
      kinds,
      log: () => undefined,
    };

    const pump = startPump();
    try {
      const summary = await syncConnection(context, CONNECTION_ID);
      expect(summary.status).toBe("success");
      expect(summary.upserts).toBe(500);
    } finally {
      stopPump = true;
      await pump;
    }

    // Ops inside one chunk apply synchronously (the counter cannot move);
    // between the two chunks the engine yields, so the counter advances.
    expect(ticksAtOp).toHaveLength(500);
    expect(ticksAtOp[249]).toBe(ticksAtOp[0] ?? -1);
    expect(ticksAtOp[250] ?? 0).toBeGreaterThan(ticksAtOp[249] ?? 0);
    expect(ticksAtOp[499]).toBe(ticksAtOp[250] ?? -1);
  });
});

describe("syncConnection event-loop friendliness", () => {
  test("yields to the event loop between page commits", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    // A concurrent counter task stands in for pending HTTP work: it can
    // only advance when the sync engine yields back to the event loop.
    let timerTicks = 0;
    let stopPump = false;
    const startPump = async (): Promise<void> => {
      while (!stopPump) {
        timerTicks += 1;
        await Bun.sleep(0);
      }
    };
    const ticksAtPage: number[] = [];
    const pageBody = (page: string | null): Record<string, unknown> => {
      if (page === null) {
        return {
          items: [timedEvent("evt-1", '"e1-v1"', "One")],
          nextPageToken: "page-2",
        };
      }
      if (page === "page-2") {
        return {
          items: [timedEvent("evt-2", '"e2-v1"', "Two")],
          nextPageToken: "page-3",
        };
      }
      return {
        items: [timedEvent("evt-3", '"e3-v1"', "Three")],
        nextSyncToken: "sync-token-1",
      };
    };
    const fake = makeFakeGoogle((url) => {
      if (isCalendarList(url)) {
        return json(calendarListPage(["primary"]));
      }
      if (!isEvents(url, "primary")) {
        return null;
      }
      ticksAtPage.push(timerTicks);
      return json(pageBody(url.searchParams.get("pageToken")));
    });

    const pump = startPump();
    try {
      const summary = await syncConnection(
        engineContext(testApp, fake.fetchLike),
        CONNECTION_ID,
      );
      expect(summary.status).toBe("success");
    } finally {
      stopPump = true;
      await pump;
    }

    // The counter advanced between every pair of page requests: proof
    // the engine yields between page commits instead of starving the
    // event loop for the whole multi-page sync.
    expect(ticksAtPage).toHaveLength(3);
    expect(ticksAtPage[1] ?? 0).toBeGreaterThan(ticksAtPage[0] ?? 0);
    expect(ticksAtPage[2] ?? 0).toBeGreaterThan(ticksAtPage[1] ?? 0);
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
