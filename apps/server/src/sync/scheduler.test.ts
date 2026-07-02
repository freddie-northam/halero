import { describe, expect, test } from "bun:test";
import { encryptCredentials } from "@halero/core";
import { connections, syncRuns } from "@halero/db";
import { eq } from "drizzle-orm";
import { makeTestApp, type TestApp } from "../test-utils";
import { saveGoogleClient } from "./client-config";
import { GOOGLE_CONNECTOR_ID } from "./connection";
import { createSyncRunner, type SyncRunnerContext } from "./runner";
import {
  createScheduler,
  findDueConnectionIds,
  runSchedulerTick,
  type SchedulerContext,
} from "./scheduler";

interface SeedOptions {
  readonly id: string;
  readonly status?: string;
  readonly nextSyncAt?: number | null;
}

const seedConnection = (testApp: TestApp, options: SeedOptions): void => {
  const { database, key, clock } = testApp;
  database.db
    .insert(connections)
    .values({
      id: options.id,
      connectorId: GOOGLE_CONNECTOR_ID,
      displayName: "Google Calendar",
      config: JSON.stringify({
        email: "person@example.com",
        accountKey: `sub-${options.id}`,
      }),
      credentialsEnc: Buffer.from(
        encryptCredentials(
          key,
          JSON.stringify({
            refreshToken: "1//refresh-a",
            accessToken: "ya29.valid",
            accessTokenExpiresAt: clock.value + 3_600_000,
          }),
        ),
      ),
      status: options.status ?? "active",
      nextSyncAt: options.nextSyncAt === undefined ? null : options.nextSyncAt,
      createdAt: clock.value,
    })
    .run();
};

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const happyFetch = (input: string | URL): Promise<Response> => {
  const url = new URL(String(input));
  if (url.pathname === "/calendar/v3/users/me/calendarList") {
    return Promise.resolve(
      json({ items: [{ id: "primary", summary: "Personal" }] }),
    );
  }
  return Promise.resolve(json({ items: [], nextSyncToken: "sync-token-1" }));
};

const makeContexts = (
  testApp: TestApp,
  outboundFetch: SyncRunnerContext["outboundFetch"] = happyFetch,
): { runner: ReturnType<typeof createSyncRunner>; ctx: SchedulerContext } => {
  saveGoogleClient(testApp.database.db, testApp.key, {
    clientId: "1234-abc.apps.googleusercontent.com",
    clientSecret: "GOCSPX-super-secret-value",
  });
  const runner = createSyncRunner({
    database: testApp.database,
    key: testApp.key,
    now: () => testApp.clock.value,
    outboundFetch,
    random: () => 0.5,
  });
  return {
    runner,
    ctx: {
      db: testApp.database.db,
      now: () => testApp.clock.value,
      runner,
    },
  };
};

const runsFor = (testApp: TestApp, connectionId: string) =>
  testApp.database.db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.connectionId, connectionId))
    .all();

const getConnection = (testApp: TestApp, id: string) => {
  const row = testApp.database.db
    .select()
    .from(connections)
    .where(eq(connections.id, id))
    .get();
  if (row === undefined) {
    throw new Error(`expected connection ${id} to exist`);
  }
  return row;
};

describe("findDueConnectionIds", () => {
  test("selects only active connections whose next_sync_at has passed", () => {
    const testApp = makeTestApp();
    const now = testApp.clock.value;
    seedConnection(testApp, { id: "due-past", nextSyncAt: now - 1_000 });
    seedConnection(testApp, { id: "due-now", nextSyncAt: now });
    seedConnection(testApp, { id: "future", nextSyncAt: now + 1_000 });
    seedConnection(testApp, {
      id: "reauth",
      status: "reauth_required",
      nextSyncAt: now - 1_000,
    });
    seedConnection(testApp, { id: "unscheduled", nextSyncAt: null });

    const due = findDueConnectionIds(testApp.database.db, now);

    expect(due).toEqual(["due-past", "due-now"]);
  });
});

describe("runSchedulerTick", () => {
  test("claims due connections through the shared runner and reschedules them", async () => {
    const testApp = makeTestApp();
    const now = testApp.clock.value;
    seedConnection(testApp, { id: "due-1", nextSyncAt: now - 5_000 });
    seedConnection(testApp, { id: "future-1", nextSyncAt: now + 60_000 });
    const { ctx } = makeContexts(testApp);

    await runSchedulerTick(ctx);

    expect(runsFor(testApp, "due-1")).toHaveLength(1);
    expect(runsFor(testApp, "due-1")[0]?.status).toBe("success");
    expect(runsFor(testApp, "future-1")).toHaveLength(0);
    expect(getConnection(testApp, "due-1").nextSyncAt).toBe(now + 300_000);
    expect(getConnection(testApp, "future-1").nextSyncAt).toBe(now + 60_000);
  });

  test("a connection overdue for a week runs once and reschedules from now", async () => {
    const testApp = makeTestApp();
    const now = testApp.clock.value;
    seedConnection(testApp, { id: "stale", nextSyncAt: now - 7 * 86_400_000 });
    const { ctx } = makeContexts(testApp);

    await runSchedulerTick(ctx);
    // The no-burst invariant: no replay of missed intervals, so an
    // immediate second tick finds nothing due.
    await runSchedulerTick(ctx);

    expect(runsFor(testApp, "stale")).toHaveLength(1);
    expect(getConnection(testApp, "stale").nextSyncAt).toBe(now + 300_000);
  });

  test("silently skips a connection whose sync is already in flight", async () => {
    const testApp = makeTestApp();
    const now = testApp.clock.value;
    seedConnection(testApp, { id: "busy", nextSyncAt: now - 1_000 });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gatedFetch = async (
      input: string | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      void init;
      await gate;
      return happyFetch(input);
    };
    const { runner, ctx } = makeContexts(testApp, gatedFetch);

    const manual = runner.runNow("busy");
    await runSchedulerTick(ctx);

    // Only the hanging manual run ever started; the tick did not stack
    // a second one and did not reject.
    expect(runsFor(testApp, "busy")).toHaveLength(1);
    release();
    const summary = await manual;
    expect(summary.status).toBe("success");
    expect(runsFor(testApp, "busy")).toHaveLength(1);
  });
});

describe("createScheduler", () => {
  test("start() arms the cron job and stop() cancels it", () => {
    const testApp = makeTestApp();
    const { ctx } = makeContexts(testApp);
    const scheduler = createScheduler(ctx, { intervalSeconds: 30 });

    expect(scheduler.isRunning()).toBe(false);
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    // Starting twice must not stack a second job.
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
    // stop() is safe to call again.
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });
});
