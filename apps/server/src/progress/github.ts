// GitHub contributions fetching for the Progress heatmap. Pure parsing
// plus a fetch-injected client so callers (and tests) supply their own
// FetchLike and never reach the network implicitly.

import { asRecord, type FetchLike, stringOrNull } from "@halero/connector-sdk";
import type { ActivityDay } from "./stats";

export const GITHUB_GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

export const buildContributionsQuery = (): string =>
  `query($from: DateTime!, $to: DateTime!) { viewer { login contributionsCollection(from: $from, to: $to) { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } } } }`;

export interface GithubContributions {
  readonly login: string;
  readonly total: number;
  readonly days: ActivityDay[];
}

const numberOrZero = (value: unknown): number =>
  typeof value === "number" ? value : 0;

const flattenDays = (weeks: readonly unknown[]): ActivityDay[] => {
  const days: ActivityDay[] = [];
  for (const week of weeks) {
    const contributionDays = asRecord(week)?.contributionDays;
    if (!Array.isArray(contributionDays)) continue;
    for (const entry of contributionDays) {
      const record = asRecord(entry);
      const date = stringOrNull(record?.date);
      if (date === null) continue;
      days.push({ date, count: numberOrZero(record?.contributionCount) });
    }
  }
  return days;
};

/**
 * Parse a GraphQL response body into contributions, flattening
 * weeks[].contributionDays[] ascending. Returns null if the expected
 * viewer/contributionCalendar shape is missing.
 */
export const mapContributionCalendar = (
  body: unknown,
): GithubContributions | null => {
  const data = asRecord(asRecord(body)?.data);
  const viewer = asRecord(data?.viewer);
  const login = stringOrNull(viewer?.login);
  const collection = asRecord(viewer?.contributionsCollection);
  const calendar = asRecord(collection?.contributionCalendar);
  if (login === null || calendar === null) return null;
  if (!Array.isArray(calendar.weeks)) return null;
  return {
    login,
    total: numberOrZero(calendar.totalContributions),
    days: flattenDays(calendar.weeks),
  };
};

/** First GraphQL error message GitHub returned (200 with `errors`), or null. */
const firstGraphqlError = (body: unknown): string | null => {
  const errors = asRecord(body)?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return stringOrNull(asRecord(errors[0])?.message) ?? "Unknown GitHub error.";
};

export const fetchContributions = async (
  fetch: FetchLike,
  token: string,
  from: string,
  to: string,
): Promise<GithubContributions> => {
  let response: Response;
  try {
    response = await fetch(GITHUB_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "Halero",
      },
      body: JSON.stringify({
        query: buildContributionsQuery(),
        variables: { from, to },
      }),
    });
  } catch (cause) {
    throw new Error("Could not reach GitHub to load your contributions.", {
      cause,
    });
  }
  if (!response.ok) {
    throw new Error(
      `GitHub rejected the contributions request (HTTP ${response.status}).`,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new Error("GitHub returned an unreadable contributions response.", {
      cause,
    });
  }
  const graphqlError = firstGraphqlError(body);
  if (graphqlError !== null) {
    throw new Error(
      `GitHub could not load your contributions: ${graphqlError}`,
    );
  }
  const contributions = mapContributionCalendar(body);
  if (contributions === null) {
    throw new Error("GitHub returned contributions in an unexpected shape.");
  }
  return contributions;
};
