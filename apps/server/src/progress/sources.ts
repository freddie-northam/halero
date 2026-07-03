// The activity-source seam. V1 has one source (GitHub); a future source
// (Claude Code, Codex) adds one fetchDaily here and reuses the store, stats,
// and the whole web layer unchanged. Each source turns a connection (or a
// local read) into a densifiable {date, count} series for one window.

import { addDaysToDateString, type FetchLike } from "@halero/connector-sdk";
import type { HaleroDatabase } from "@halero/db";
import { readConnectionToken } from "../connections/connection-token";
import { fetchContributions } from "./github";
import type { ActivityDay } from "./stats";

type Db = HaleroDatabase["db"];

export const GITHUB_SOURCE_ID = "github";

export interface FetchDailyDeps {
  readonly db: Db;
  readonly key: Uint8Array;
  readonly fetch: FetchLike;
  /** Today in the home timezone, 'YYYY-MM-DD'. */
  readonly today: string;
}

export interface FetchDailyResult {
  readonly accountLabel: string;
  readonly total: number;
  readonly days: readonly ActivityDay[];
}

/**
 * Pulls the trailing year of GitHub contribution counts with the stored
 * PAT. Returns null when GitHub is not connected, so the caller can show a
 * connect prompt. contributionsCollection accepts at most a one-year
 * window, so `from` is today minus 365 days.
 */
export const fetchGithubDaily = async (
  deps: FetchDailyDeps,
): Promise<FetchDailyResult | null> => {
  const token = readConnectionToken(deps.db, deps.key, GITHUB_SOURCE_ID);
  if (token === null) {
    return null;
  }
  const from = `${addDaysToDateString(deps.today, -365)}T00:00:00Z`;
  const to = `${deps.today}T23:59:59Z`;
  const contributions = await fetchContributions(deps.fetch, token, from, to);
  return {
    accountLabel: contributions.login,
    total: contributions.total,
    days: contributions.days,
  };
};
