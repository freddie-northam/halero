import { describe, expect, test } from "bun:test";
import { connections, syncRuns } from "@halero/db";
import { createSchedulerHealth } from "./healthz";
import { createSyncRunner } from "./sync/runner";
import { runSchedulerTick } from "./sync/scheduler";
import { makeTestApp, type TestApp } from "./test-utils";

interface HealthzBody {
  readonly status: string;
  readonly lastTickAt: number | null;
  readonly connections: readonly Record<string, unknown>[];
}

const seedConnection = (
  testApp: TestApp,
  overrides: {
    readonly status?: string;
    readonly consecutiveFailures?: number;
  } = {},
): void => {
  testApp.database.db
    .insert(connections)
    .values({
      id: "conn-1",
      connectorId: "google-calendar",
      displayName: "Google Calendar",
      config: JSON.stringify({
        email: "person@example.com",
        accountKey: "google-sub-1",
      }),
      status: overrides.status ?? "active",
      consecutiveFailures: overrides.consecutiveFailures ?? 0,
      nextSyncAt: testApp.clock.value,
      createdAt: testApp.clock.value,
    })
    .run();
};

const fetchHealthz = async (testApp: TestApp): Promise<HealthzBody> => {
  const res = await testApp.app.fetch(new Request("http://localhost/healthz"));
  expect(res.status).toBe(200);
  return (await res.json()) as HealthzBody;
};

describe("GET /healthz", () => {
  test("reports ok with no connections and no ticks, unauthenticated", async () => {
    const testApp = makeTestApp();

    const body = await fetchHealthz(testApp);

    expect(body).toEqual({ status: "ok", lastTickAt: null, connections: [] });
  });

  test("lists connections with minimal fields only", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp);
    testApp.database.db
      .insert(syncRuns)
      .values({
        id: "run-1",
        connectionId: "conn-1",
        startedAt: testApp.clock.value - 60_000,
        finishedAt: testApp.clock.value - 59_000,
        status: "success",
      })
      .run();

    const body = await fetchHealthz(testApp);

    // The exact shape: no email, no id, no error text, nothing else.
    expect(body.connections).toEqual([
      {
        connectorId: "google-calendar",
        status: "active",
        lastSuccessAt: testApp.clock.value - 59_000,
      },
    ]);
    expect(body.status).toBe("ok");
  });

  test("degrades when a connection needs a fresh sign-in", async () => {
    const testApp = makeTestApp();
    seedConnection(testApp, { status: "reauth_required" });

    const body = await fetchHealthz(testApp);

    expect(body.status).toBe("degraded");
  });

  test("degrades at 3 consecutive failures but not below", async () => {
    const twoFailures = makeTestApp();
    seedConnection(twoFailures, { consecutiveFailures: 2 });
    expect((await fetchHealthz(twoFailures)).status).toBe("ok");

    const threeFailures = makeTestApp();
    seedConnection(threeFailures, { consecutiveFailures: 3 });
    expect((await fetchHealthz(threeFailures)).status).toBe("degraded");
  });

  test("degrades when the running scheduler has not ticked for 5 minutes", async () => {
    const health = createSchedulerHealth();
    const testApp = makeTestApp({ schedulerHealth: health });
    health.markStarted(testApp.clock.value);
    health.recordTick(testApp.clock.value);
    testApp.clock.value += 5 * 60_000 + 1;

    const body = await fetchHealthz(testApp);

    expect(body.status).toBe("degraded");
    expect(body.lastTickAt).toBe(testApp.clock.value - 5 * 60_000 - 1);
  });

  test("stays ok while the scheduler ticks on time", async () => {
    const health = createSchedulerHealth();
    const testApp = makeTestApp({ schedulerHealth: health });
    health.markStarted(testApp.clock.value);
    health.recordTick(testApp.clock.value);
    testApp.clock.value += 30_000;

    const body = await fetchHealthz(testApp);

    expect(body.status).toBe("ok");
    expect(body.lastTickAt).toBe(testApp.clock.value - 30_000);
  });

  test("degrades when the scheduler started but never managed a tick", async () => {
    const health = createSchedulerHealth();
    const testApp = makeTestApp({ schedulerHealth: health });
    health.markStarted(testApp.clock.value);
    testApp.clock.value += 5 * 60_000 + 1;

    const body = await fetchHealthz(testApp);

    expect(body.status).toBe("degraded");
    expect(body.lastTickAt).toBeNull();
  });

  test("a stopped scheduler is never counted as stale", async () => {
    const health = createSchedulerHealth();
    const testApp = makeTestApp({ schedulerHealth: health });
    health.markStarted(testApp.clock.value);
    health.recordTick(testApp.clock.value);
    health.markStopped();
    testApp.clock.value += 60 * 60_000;

    const body = await fetchHealthz(testApp);

    expect(body.status).toBe("ok");
  });
});

describe("scheduler tick recording", () => {
  test("runSchedulerTick records its timestamp in the health state", async () => {
    const testApp = makeTestApp();
    const health = createSchedulerHealth();
    const runner = createSyncRunner({
      database: testApp.database,
      key: testApp.key,
      now: () => testApp.clock.value,
      outboundFetch: () => Promise.resolve(new Response("{}")),
      random: () => 0.5,
    });

    await runSchedulerTick({
      db: testApp.database.db,
      now: () => testApp.clock.value,
      runner,
      health,
    });

    expect(health.read().lastTickAt).toBe(testApp.clock.value);
  });
});
