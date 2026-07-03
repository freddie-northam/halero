import { describe, expect, test } from "bun:test";
import { dateStringInZone } from "@halero/connector-sdk";
import { upsertDailyCounts } from "../progress/store";
import { upsertApiKeyConnection } from "../sync/connection";
import {
  completeSetup,
  type MakeTestAppOptions,
  makeTestApp,
  type TestApp,
  type TrpcSuccess,
  trpcMutation,
  trpcQuery,
} from "../test-utils";

const todayOf = (testApp: TestApp): string =>
  dateStringInZone(testApp.clock.value, "UTC");

const connectGithub = (testApp: TestApp): void => {
  upsertApiKeyConnection(
    testApp.database.db,
    testApp.key,
    testApp.clock.value,
    { connectorId: "github", displayName: "GitHub" },
    "octocat",
    "ghp_token",
  );
};

interface StatusData {
  readonly connected: boolean;
  readonly login: string | null;
  readonly lastSyncedAt: number | null;
  readonly lastError: string | null;
}

const readStatus = async (
  app: TestApp["app"],
  cookie: string,
): Promise<StatusData> => {
  const res = await trpcQuery(app, "progress.status", { cookie });
  expect(res.status).toBe(200);
  return ((await res.json()) as TrpcSuccess<StatusData>).result.data;
};

describe("progress.status", () => {
  test("reports not connected before GitHub is connected", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    expect(await readStatus(testApp.app, cookie)).toEqual({
      connected: false,
      login: null,
      lastSyncedAt: null,
      lastError: null,
    });
  });

  test("reports the login and last-synced once connected and refreshed", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    connectGithub(testApp);
    upsertDailyCounts(
      testApp.database.db,
      "github",
      [{ date: todayOf(testApp), count: 3 }],
      testApp.clock.value,
    );
    const status = await readStatus(testApp.app, cookie);
    expect(status.connected).toBe(true);
    expect(status.login).toBe("octocat");
    expect(status.lastSyncedAt).toBe(testApp.clock.value);
  });
});

interface HeatmapData {
  readonly from: string;
  readonly to: string;
  readonly today: string;
  readonly days: { date: string; count: number }[];
  readonly total: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
}

describe("progress.heatmap", () => {
  test("densifies the range and computes totals from stored counts", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const today = todayOf(testApp);
    upsertDailyCounts(
      testApp.database.db,
      "github",
      [{ date: today, count: 5 }],
      testApp.clock.value,
    );

    const res = await trpcQuery(testApp.app, "progress.heatmap", {
      cookie,
      input: { range: "month" },
    });
    const data = ((await res.json()) as TrpcSuccess<HeatmapData>).result.data;

    expect(data.to).toBe(today);
    expect(data.days).toHaveLength(31); // 30 days back, inclusive
    expect(data.days.at(-1)).toEqual({ date: today, count: 5 });
    expect(data.days[0]?.count).toBe(0); // densified zero
    expect(data.total).toBe(5);
    expect(data.currentStreak).toBe(1);
    expect(data.longestStreak).toBe(1);
  });
});

const githubContribFetch =
  (
    count: number,
    login = "octocat",
  ): NonNullable<MakeTestAppOptions["outboundFetch"]> =>
  (input, _init) => {
    const url = new URL(String(input));
    if (url.host !== "api.github.com") {
      throw new Error(`unexpected call: ${url.toString()}`);
    }
    return Promise.resolve(
      Response.json({
        data: {
          viewer: {
            login,
            contributionsCollection: {
              contributionCalendar: {
                totalContributions: count,
                weeks: [
                  {
                    contributionDays: [
                      { date: "2026-06-01", contributionCount: count },
                    ],
                  },
                ],
              },
            },
          },
        },
      }),
    );
  };

describe("progress.refresh", () => {
  test("rejects readably when GitHub is not connected", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const res = await trpcMutation(
      testApp.app,
      "progress.refresh",
      {},
      {
        cookie,
      },
    );
    expect(res.status).toBe(412);
    expect(await res.text()).toContain("Connect GitHub");
  });

  test("fetches contributions, fills the store, and reports counts", async () => {
    const testApp = makeTestApp({ outboundFetch: githubContribFetch(7) });
    const cookie = await completeSetup(testApp.app);
    connectGithub(testApp);

    const res = await trpcMutation(
      testApp.app,
      "progress.refresh",
      {},
      {
        cookie,
      },
    );
    expect(res.status).toBe(200);
    const data = (
      (await res.json()) as TrpcSuccess<{
        syncedDays: number;
        total: number;
        lastSyncedAt: number;
      }>
    ).result.data;
    expect(data.syncedDays).toBe(1);
    expect(data.total).toBe(7);
    expect(data.lastSyncedAt).toBe(testApp.clock.value);
  });
});
