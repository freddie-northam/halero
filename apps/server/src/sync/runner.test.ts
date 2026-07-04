import { describe, expect, test } from "bun:test";
import { encryptCredentials } from "@halero/core";
import { connections, syncRuns } from "@halero/db";
import { eq } from "drizzle-orm";
import { saveOauthClient } from "../connections/oauth-client";
import { createNotifier, type NotificationPayload } from "../notifier";
import { setSetting } from "../settings";
import { makeTestApp, type TestApp } from "../test-utils";
import { GOOGLE_CONNECTOR_ID } from "./connection";
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
  saveOauthClient(database.db, key, "google-calendar", {
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
  outboundFetch: FetchLike,
  random: () => number = () => 0.5,
): SyncRunnerContext => ({
  database: testApp.database,
  key: testApp.key,
  now: () => testApp.clock.value,
  outboundFetch,
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

interface NotifierHarness {
  readonly sent: NotificationPayload[];
  readonly notifier: ReturnType<typeof createNotifier>;
}

const makeNotifierHarness = (
  testApp: TestApp,
  options: { readonly url?: string | null; readonly failing?: boolean } = {},
): NotifierHarness => {
  if (options.url !== null) {
    setSetting(
      testApp.database.db,
      "notify_url",
      options.url ?? "https://ntfy.sh/halero",
    );
  }
  const sent: NotificationPayload[] = [];
  const notifier = createNotifier({
    db: testApp.database.db,
    notifyFetch: (_input, init) => {
      sent.push(JSON.parse(String(init?.body)) as NotificationPayload);
      return options.failing === true
        ? Promise.reject(new Error("connect ECONNREFUSED"))
        : Promise.resolve(new Response("ok", { status: 200 }));
    },
    log: () => {},
  });
  return { sent, notifier };
};

describe("createSyncRunner failure notifications", () => {
  test("fires exactly when the streak reaches 3 and not on the 4th", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp, { consecutiveFailures: 1 });
    const harness = makeNotifierHarness(testApp);
    const runner = createSyncRunner({
      ...runnerContext(testApp, failingFetch),
      notifier: harness.notifier,
    });

    await runner.runNow(CONNECTION_ID); // failures: 2
    await Bun.sleep(0);
    expect(harness.sent).toHaveLength(0);

    await runner.runNow(CONNECTION_ID); // failures: 3 -> notify
    await Bun.sleep(0);
    expect(harness.sent).toHaveLength(1);
    expect(harness.sent[0]?.connectorId).toBe(GOOGLE_CONNECTOR_ID);
    expect(harness.sent[0]?.status).toBe("failing");
    expect(harness.sent[0]?.message).toContain("3 times in a row");

    await runner.runNow(CONNECTION_ID); // failures: 4 -> silent
    await Bun.sleep(0);
    expect(harness.sent).toHaveLength(1);
  });

  test("a success resets the streak, so the next 3rd failure refires", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp, { consecutiveFailures: 2 });
    const harness = makeNotifierHarness(testApp);
    let healthy = false;
    const switchableFetch: FetchLike = (input, init) =>
      healthy ? happyFetch(input, init) : failingFetch(input, init);
    const runner = createSyncRunner({
      ...runnerContext(testApp, switchableFetch),
      notifier: harness.notifier,
    });

    await runner.runNow(CONNECTION_ID); // failures: 3 -> notify
    healthy = true;
    await runner.runNow(CONNECTION_ID); // success -> reset to 0
    healthy = false;
    await runner.runNow(CONNECTION_ID); // 1
    await runner.runNow(CONNECTION_ID); // 2
    await Bun.sleep(0);
    expect(harness.sent).toHaveLength(1);
    await runner.runNow(CONNECTION_ID); // 3 -> notify again
    await Bun.sleep(0);

    expect(harness.sent).toHaveLength(2);
  });

  test("fires once when a run flips the connection to reauth_required", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp, {
      accessTokenExpiresAt: testApp.clock.value - 1,
    });
    const harness = makeNotifierHarness(testApp);
    const deadRefreshFetch: FetchLike = (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/token") {
        return Promise.resolve(json({ error: "invalid_grant" }, 400));
      }
      throw new Error(`unexpected Google call: ${url.toString()}`);
    };
    const runner = createSyncRunner({
      ...runnerContext(testApp, deadRefreshFetch),
      notifier: harness.notifier,
    });

    const summary = await runner.runNow(CONNECTION_ID);
    await Bun.sleep(0);

    expect(summary.status).toBe("failed");
    expect(harness.sent).toHaveLength(1);
    expect(harness.sent[0]?.status).toBe("reauth_required");
    // A reauth_required connection cannot start another run, so the
    // transition can only ever notify once.
    const blocked = await runner.runNow(CONNECTION_ID).then(
      () => null,
      (error: unknown) => error,
    );
    expect(blocked).toBeInstanceOf(Error);
    await Bun.sleep(0);
    expect(harness.sent).toHaveLength(1);
  });

  test("stays silent when no notify_url is configured", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp, { consecutiveFailures: 2 });
    const harness = makeNotifierHarness(testApp, { url: null });
    const runner = createSyncRunner({
      ...runnerContext(testApp, failingFetch),
      notifier: harness.notifier,
    });

    await runner.runNow(CONNECTION_ID); // failures: 3, but nowhere to send
    await Bun.sleep(0);

    expect(harness.sent).toHaveLength(0);
  });

  test("a broken notification target never affects the run", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp, { consecutiveFailures: 2 });
    const harness = makeNotifierHarness(testApp, { failing: true });
    const runner = createSyncRunner({
      ...runnerContext(testApp, failingFetch),
      notifier: harness.notifier,
    });

    const summary = await runner.runNow(CONNECTION_ID);
    await Bun.sleep(0);

    // The run finished and rescheduled normally despite the dead target.
    expect(summary.status).toBe("failed");
    expect(getConnection(testApp).consecutiveFailures).toBe(3);
    expect(harness.sent).toHaveLength(1);
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
