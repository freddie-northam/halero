import { describe, expect, test } from "bun:test";
import { encryptCredentials } from "@halero/core";
import { connections, syncRuns } from "@halero/db";
import { eq } from "drizzle-orm";
import { saveGoogleClient } from "../google/client-config";
import { GOOGLE_CONNECTOR_ID } from "../google/common";
import { makeTestApp, type TestApp } from "../test-utils";
import { createSyncRunner, type SyncRunnerContext } from "./runner";

const CONNECTION_ID = "conn-1";

interface SeedOptions {
  readonly status?: string;
  readonly nextSyncAt?: number;
  readonly consecutiveFailures?: number;
  readonly accessTokenExpiresAt?: number;
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
        accountKey: "google-sub-1",
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
      nextSyncAt: options.nextSyncAt ?? clock.value,
      consecutiveFailures: options.consecutiveFailures ?? 0,
      createdAt: clock.value,
    })
    .run();
};

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

const countRuns = (testApp: TestApp): number =>
  testApp.database.db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.connectionId, CONNECTION_ID))
    .all().length;

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** One calendar, one event, one page: the smallest successful sync. */
const happyFetch: FetchLike = (input) => {
  const url = new URL(String(input));
  if (url.pathname === "/calendar/v3/users/me/calendarList") {
    return Promise.resolve(
      json({ items: [{ id: "primary", summary: "Personal" }] }),
    );
  }
  return Promise.resolve(
    json({
      items: [
        {
          id: "evt-1",
          etag: '"e1-v1"',
          status: "confirmed",
          summary: "Standup",
          start: { dateTime: "2025-07-02T09:30:00+01:00" },
          end: { dateTime: "2025-07-02T09:45:00+01:00" },
        },
      ],
      nextSyncToken: "sync-token-1",
    }),
  );
};

const failingFetch: FetchLike = () =>
  Promise.resolve(new Response("boom", { status: 500 }));

const runnerContext = (
  testApp: TestApp,
  googleFetch: FetchLike,
  random: () => number = () => 0.5,
): SyncRunnerContext => ({
  database: testApp.database,
  key: testApp.key,
  now: () => testApp.clock.value,
  googleFetch,
  random,
});

describe("createSyncRunner rescheduling", () => {
  test("success resets failures and schedules from now, not the missed slot", async () => {
    const testApp = makeTestApp();
    // next_sync_at a week in the past: the run must reschedule from NOW
    // (the no-burst invariant), never replay missed intervals.
    seedConnection(testApp, {
      nextSyncAt: testApp.clock.value - 7 * 86_400_000,
      consecutiveFailures: 3,
    });
    const runner = createSyncRunner(runnerContext(testApp, happyFetch));

    const summary = await runner.runNow(CONNECTION_ID);

    expect(summary.status).toBe("success");
    const row = getConnection(testApp);
    expect(row.consecutiveFailures).toBe(0);
    expect(row.nextSyncAt).toBe(testApp.clock.value + 300_000);
  });

  test("jittered reschedules stay within +/-10% of the interval", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    const low = createSyncRunner(runnerContext(testApp, happyFetch, () => 0));
    await low.runNow(CONNECTION_ID);
    const lowNext = getConnection(testApp).nextSyncAt;

    const high = createSyncRunner(
      runnerContext(testApp, happyFetch, () => 0.99),
    );
    await high.runNow(CONNECTION_ID);
    const highNext = getConnection(testApp).nextSyncAt;

    expect(lowNext).toBe(testApp.clock.value + 270_000);
    expect(highNext).toBeGreaterThan(testApp.clock.value + 300_000);
    expect(highNext).toBeLessThan(testApp.clock.value + 330_000);
  });

  test("transient failures back off exponentially and cap at an hour", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    const runner = createSyncRunner(runnerContext(testApp, failingFetch));

    await runner.runNow(CONNECTION_ID);
    expect(getConnection(testApp).consecutiveFailures).toBe(1);
    expect(getConnection(testApp).nextSyncAt).toBe(
      testApp.clock.value + 600_000,
    );

    await runner.runNow(CONNECTION_ID);
    expect(getConnection(testApp).consecutiveFailures).toBe(2);
    expect(getConnection(testApp).nextSyncAt).toBe(
      testApp.clock.value + 1_200_000,
    );

    testApp.database.db
      .update(connections)
      .set({ consecutiveFailures: 10 })
      .where(eq(connections.id, CONNECTION_ID))
      .run();
    await runner.runNow(CONNECTION_ID);
    expect(getConnection(testApp).consecutiveFailures).toBe(11);
    expect(getConnection(testApp).nextSyncAt).toBe(
      testApp.clock.value + 3_600_000,
    );
  });

  test("a run that flips the connection to reauth_required is never rescheduled", async () => {
    const testApp = makeTestApp();
    const seededNextSyncAt = testApp.clock.value - 60_000;
    seedConnection(testApp, {
      nextSyncAt: seededNextSyncAt,
      // Expired access token forces a refresh, which Google refuses.
      accessTokenExpiresAt: testApp.clock.value - 1,
    });
    const deadRefreshFetch: FetchLike = (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/token") {
        return Promise.resolve(json({ error: "invalid_grant" }, 400));
      }
      throw new Error(`unexpected Google call: ${url.toString()}`);
    };
    const runner = createSyncRunner(runnerContext(testApp, deadRefreshFetch));

    const summary = await runner.runNow(CONNECTION_ID);

    expect(summary.status).toBe("failed");
    const row = getConnection(testApp);
    expect(row.status).toBe("reauth_required");
    // Scheduling state is untouched: only a reconnect revives this
    // connection, and the reconnect path resets both fields itself.
    expect(row.consecutiveFailures).toBe(0);
    expect(row.nextSyncAt).toBe(seededNextSyncAt);
  });
});

describe("createSyncRunner in-flight guard", () => {
  test("rejects a second run readably while one is in flight", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gatedFetch: FetchLike = async (input, init) => {
      await gate;
      return happyFetch(input, init);
    };
    const runner = createSyncRunner(runnerContext(testApp, gatedFetch));

    const first = runner.runNow(CONNECTION_ID);
    expect(runner.isRunning(CONNECTION_ID)).toBe(true);
    const second = await runner.runNow(CONNECTION_ID).then(
      () => null,
      (error: unknown) => error,
    );

    if (!(second instanceof Error)) {
      throw new Error("expected the second run to reject");
    }
    expect(second.message).toContain("already running");

    release();
    const summary = await first;
    expect(summary.status).toBe("success");
    expect(runner.isRunning(CONNECTION_ID)).toBe(false);
    // Only the first run ever produced a run row.
    expect(countRuns(testApp)).toBe(1);
  });

  test("clears the in-flight mark when a guard rejects the run", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp, { status: "reauth_required" });
    const runner = createSyncRunner(runnerContext(testApp, happyFetch));

    const outcome = await runner.runNow(CONNECTION_ID).then(
      () => null,
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(Error);
    expect(runner.isRunning(CONNECTION_ID)).toBe(false);
  });
});

describe("createSyncRunner retention", () => {
  test("prunes the connection's runs after each run", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    for (let i = 1; i <= 25; i += 1) {
      testApp.database.db
        .insert(syncRuns)
        .values({
          id: `old-${String(i).padStart(2, "0")}`,
          connectionId: CONNECTION_ID,
          startedAt: 1_000 + i,
          finishedAt: 1_001 + i,
          status: "success",
        })
        .run();
    }
    const runner = createSyncRunner(runnerContext(testApp, happyFetch));

    await runner.runNow(CONNECTION_ID);

    expect(countRuns(testApp)).toBe(20);
  });
});
