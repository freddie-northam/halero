import { describe, expect, test } from "bun:test";
import { dateStringInZone } from "@halero/connector-sdk";
import { upsertDailyCounts } from "../progress/store";
import {
  upsertApiKeyConnection,
  upsertLocalConnection,
} from "../sync/connection";
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

const githubFetch =
  (
    body: unknown,
    status = 200,
  ): NonNullable<MakeTestAppOptions["outboundFetch"]> =>
  (input) => {
    const url = new URL(String(input));
    if (url.host !== "api.github.com") {
      throw new Error(`unexpected call: ${url.toString()}`);
    }
    return Promise.resolve(Response.json(body, { status }));
  };

describe("progress developer live reads", () => {
  test("reviewRequests reports not connected when GitHub is absent", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const res = await trpcQuery(testApp.app, "progress.reviewRequests", {
      cookie,
    });
    const data = (
      (await res.json()) as TrpcSuccess<{
        connected: boolean;
        items: unknown[];
      }>
    ).result.data;
    expect(data).toEqual({ connected: false, items: [] });
  });

  test("myOpenPullRequests returns items with rolled-up checks", async () => {
    const body = {
      data: {
        search: {
          nodes: [
            {
              __typename: "PullRequest",
              title: "Fix auth",
              number: 214,
              url: "https://github.com/acme/api/pull/214",
              updatedAt: "2026-07-03T10:00:00Z",
              repository: { nameWithOwner: "acme/api" },
              reviewDecision: "APPROVED",
              commits: {
                nodes: [
                  { commit: { statusCheckRollup: { state: "SUCCESS" } } },
                ],
              },
            },
          ],
        },
      },
    };
    const testApp = makeTestApp({ outboundFetch: githubFetch(body) });
    const cookie = await completeSetup(testApp.app);
    connectGithub(testApp);
    const res = await trpcQuery(testApp.app, "progress.myOpenPullRequests", {
      cookie,
    });
    const data = (
      (await res.json()) as TrpcSuccess<{
        connected: boolean;
        items: { checks: string; repo: string }[];
      }>
    ).result.data;
    expect(data.connected).toBe(true);
    expect(data.items[0]).toMatchObject({
      repo: "acme/api",
      checks: "success",
    });
  });

  test("a 403 from GitHub surfaces as a reconnect (403) error", async () => {
    const testApp = makeTestApp({
      outboundFetch: githubFetch({ message: "Forbidden" }, 403),
    });
    const cookie = await completeSetup(testApp.app);
    connectGithub(testApp);
    const res = await trpcQuery(testApp.app, "progress.assignedIssues", {
      cookie,
    });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("more GitHub access");
  });
});

describe("progress.summary", () => {
  test("covers only developer-category sources (excludes Wispr)", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const today = todayOf(testApp);
    connectGithub(testApp);
    upsertLocalConnection(testApp.database.db, testApp.clock.value, {
      connectorId: "wispr-flow",
      displayName: "Wispr Flow",
    });
    upsertDailyCounts(
      testApp.database.db,
      "github",
      [{ date: today, count: 5 }],
      testApp.clock.value,
    );
    upsertDailyCounts(
      testApp.database.db,
      "wispr-flow",
      [{ date: today, count: 9 }],
      testApp.clock.value,
    );

    const res = await trpcQuery(testApp.app, "progress.summary", {
      cookie,
      input: { range: "month" },
    });
    const data = (
      (await res.json()) as TrpcSuccess<{
        total: number;
        bySource: { id: string; total: number }[];
      }>
    ).result.data;
    expect(data.total).toBe(5);
    expect(data.bySource.map((s) => s.id)).toEqual(["github"]);
  });
});

describe("progress.status category + heatmap category filter", () => {
  test("status carries each source's catalog category", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const res = await trpcQuery(testApp.app, "progress.status", { cookie });
    const sources = (
      (await res.json()) as TrpcSuccess<{
        sources: { id: string; category: string | null }[];
      }>
    ).result.data.sources;
    expect(sources.find((s) => s.id === "github")?.category).toBe("developer");
    expect(sources.find((s) => s.id === "wispr-flow")?.category).toBe(
      "productivity",
    );
  });

  test("heatmap category:developer merges only dev sources", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const today = todayOf(testApp);
    connectGithub(testApp);
    upsertLocalConnection(testApp.database.db, testApp.clock.value, {
      connectorId: "wispr-flow",
      displayName: "Wispr Flow",
    });
    upsertDailyCounts(
      testApp.database.db,
      "github",
      [{ date: today, count: 5 }],
      testApp.clock.value,
    );
    upsertDailyCounts(
      testApp.database.db,
      "wispr-flow",
      [{ date: today, count: 9 }],
      testApp.clock.value,
    );

    const res = await trpcQuery(testApp.app, "progress.heatmap", {
      cookie,
      input: { range: "month", category: "developer" },
    });
    const data = ((await res.json()) as TrpcSuccess<{ total: number }>).result
      .data;
    expect(data.total).toBe(5);
  });
});
