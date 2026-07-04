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

interface SourceStatus {
  readonly id: string;
  readonly displayName: string;
  readonly connected: boolean;
  readonly lastSyncedAt: number | null;
  readonly lastError: string | null;
}

const readStatus = async (
  app: TestApp["app"],
  cookie: string,
): Promise<SourceStatus[]> => {
  const res = await trpcQuery(app, "progress.status", { cookie });
  expect(res.status).toBe(200);
  return ((await res.json()) as TrpcSuccess<{ sources: SourceStatus[] }>).result
    .data.sources;
};

describe("progress.status", () => {
  test("lists every activity source, GitHub disconnected until connected", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const before = await readStatus(testApp.app, cookie);
    const github = before.find((s) => s.id === "github");
    expect(github?.connected).toBe(false);
    // The local sources are registered too.
    expect(before.map((s) => s.id)).toEqual(
      expect.arrayContaining(["github", "claude-code", "codex", "wispr-flow"]),
    );

    connectGithub(testApp);
    upsertDailyCounts(
      testApp.database.db,
      "github",
      [{ date: todayOf(testApp), count: 3 }],
      testApp.clock.value,
    );
    const after = await readStatus(testApp.app, cookie);
    const g = after.find((s) => s.id === "github");
    expect(g?.connected).toBe(true);
    expect(g?.displayName).toBe("GitHub");
    expect(g?.lastSyncedAt).toBe(testApp.clock.value);
  });
});

interface HeatmapData {
  readonly source: string;
  readonly to: string;
  readonly days: { date: string; count: number }[];
  readonly total: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
}

describe("progress.heatmap", () => {
  test("merges connected sources and densifies the range", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const today = todayOf(testApp);
    connectGithub(testApp);
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
    expect(data.source).toBe("all");
    expect(data.days).toHaveLength(31);
    expect(data.days.at(-1)).toEqual({ date: today, count: 5 });
    expect(data.total).toBe(5);
  });

  test("reads a single source directly without requiring a connection", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const today = todayOf(testApp);
    upsertDailyCounts(
      testApp.database.db,
      "claude-code",
      [{ date: today, count: 8 }],
      testApp.clock.value,
    );
    const res = await trpcQuery(testApp.app, "progress.heatmap", {
      cookie,
      input: { range: "month", source: "claude-code" },
    });
    const data = ((await res.json()) as TrpcSuccess<HeatmapData>).result.data;
    expect(data.source).toBe("claude-code");
    expect(data.total).toBe(8);
  });
});

const githubContribFetch =
  (count: number): NonNullable<MakeTestAppOptions["outboundFetch"]> =>
  (input) => {
    const url = new URL(String(input));
    if (url.host !== "api.github.com") {
      throw new Error(`unexpected call: ${url.toString()}`);
    }
    return Promise.resolve(
      Response.json({
        data: {
          viewer: {
            login: "octocat",
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

interface RefreshData {
  readonly lastSyncedAt: number;
  readonly sources: {
    id: string;
    syncedDays: number;
    total: number;
    error: string | null;
  }[];
}

describe("progress.refresh", () => {
  test("rejects readably when no source is connected", async () => {
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
    expect(await res.text()).toContain("Connect a source");
  });

  test("refreshes the connected GitHub source and skips the rest", async () => {
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
    const data = ((await res.json()) as TrpcSuccess<RefreshData>).result.data;
    const github = data.sources.find((s) => s.id === "github");
    expect(github).toEqual({
      id: "github",
      syncedDays: 1,
      total: 7,
      error: null,
    });
    // Only connected sources appear.
    expect(data.sources.map((s) => s.id)).toEqual(["github"]);
  });
});
