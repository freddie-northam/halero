import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type { ProgressApi } from "./api";
import { withProgressInvalidation } from "./queries";

const heatmap = {
  source: "all",
  from: "2025-07-03",
  to: "2026-07-03",
  today: "2026-07-03",
  days: [],
  total: 0,
  currentStreak: 0,
  longestStreak: 0,
};

const refreshResult = {
  lastSyncedAt: 1_700_000_000,
  sources: [{ id: "github", syncedDays: 3, total: 42, error: null }],
};

const emptyList = { connected: false, items: [] } as const;

const makeStub = () => {
  const calls: string[] = [];
  const api: ProgressApi = {
    status: () => {
      calls.push("status");
      return Promise.resolve({
        sources: [
          {
            id: "github",
            displayName: "GitHub",
            category: "developer",
            connected: true,
            lastSyncedAt: null,
            lastError: null,
          },
        ],
      });
    },
    heatmap: () => {
      calls.push("heatmap");
      return Promise.resolve(heatmap);
    },
    refresh: () => {
      calls.push("refresh");
      return Promise.resolve(refreshResult);
    },
    reviewRequests: () => Promise.resolve(emptyList),
    myOpenPullRequests: () => Promise.resolve(emptyList),
    assignedIssues: () => Promise.resolve(emptyList),
    repositories: () => Promise.resolve(emptyList),
    summary: () =>
      Promise.resolve({
        total: 0,
        currentStreak: 0,
        longestStreak: 0,
        bySource: [],
      }),
  };
  return { api, calls };
};

const makeSpyClient = () => {
  const queryClient = new QueryClient();
  let invalidations = 0;
  const original = queryClient.invalidateQueries.bind(queryClient);
  queryClient.invalidateQueries = ((...args: []) => {
    invalidations += 1;
    return original(...args);
  }) as QueryClient["invalidateQueries"];
  return { queryClient, invalidated: () => invalidations };
};

describe("withProgressInvalidation", () => {
  test("invalidates the progress queries after a refresh", async () => {
    const { api } = makeStub();
    const { queryClient, invalidated } = makeSpyClient();
    const wrapped = withProgressInvalidation(api, queryClient);

    const result = await wrapped.refresh();
    expect(result).toEqual(refreshResult);
    expect(invalidated()).toBe(1);
  });

  test("passes reads through without touching the cache", async () => {
    const { api, calls } = makeStub();
    const { queryClient, invalidated } = makeSpyClient();
    const wrapped = withProgressInvalidation(api, queryClient);

    await wrapped.status();
    await wrapped.heatmap("year");
    expect(calls).toEqual(["status", "heatmap"]);
    expect(invalidated()).toBe(0);
  });

  test("skips invalidation when the refresh fails", async () => {
    const { queryClient, invalidated } = makeSpyClient();
    const failing: ProgressApi = {
      ...makeStub().api,
      refresh: () => Promise.reject(new Error("GitHub is unavailable.")),
    };
    const wrapped = withProgressInvalidation(failing, queryClient);

    expect(wrapped.refresh()).rejects.toThrow("GitHub is unavailable.");
    expect(invalidated()).toBe(0);
  });
});
