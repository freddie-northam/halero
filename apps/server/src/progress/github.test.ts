import { describe, expect, test } from "bun:test";
import type { FetchLike } from "@halero/connector-sdk";
import { jsonResponse } from "@halero/connector-sdk";
import {
  fetchContributions,
  GITHUB_GRAPHQL_ENDPOINT,
  mapContributionCalendar,
} from "./github";

const fixtureBody = {
  data: {
    viewer: {
      login: "octocat",
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: 6,
          weeks: [
            {
              contributionDays: [
                { date: "2026-06-01", contributionCount: 1 },
                { date: "2026-06-02", contributionCount: 0 },
                { date: "2026-06-03", contributionCount: 2 },
              ],
            },
            {
              contributionDays: [
                { date: "2026-06-08", contributionCount: 3 },
                { date: "2026-06-09", contributionCount: 0 },
              ],
            },
          ],
        },
      },
    },
  },
};

describe("mapContributionCalendar", () => {
  test("flattens weeks into ascending days with login and total", () => {
    const result = mapContributionCalendar(fixtureBody);
    expect(result).not.toBeNull();
    expect(result?.login).toBe("octocat");
    expect(result?.total).toBe(6);
    expect(result?.days).toEqual([
      { date: "2026-06-01", count: 1 },
      { date: "2026-06-02", count: 0 },
      { date: "2026-06-03", count: 2 },
      { date: "2026-06-08", count: 3 },
      { date: "2026-06-09", count: 0 },
    ]);
  });

  test("returns null for a malformed body", () => {
    expect(mapContributionCalendar({ data: { viewer: null } })).toBeNull();
    expect(mapContributionCalendar("nope")).toBeNull();
  });
});

describe("fetchContributions", () => {
  test("posts to the GraphQL endpoint and maps the calendar", async () => {
    let seenUrl: string | URL | undefined;
    let seenInit: RequestInit | undefined;
    const fetch: FetchLike = async (url, init) => {
      seenUrl = url;
      seenInit = init;
      return jsonResponse(fixtureBody);
    };

    const result = await fetchContributions(
      fetch,
      "gho_token",
      "2026-06-01T00:00:00Z",
      "2026-06-30T23:59:59Z",
    );

    expect(seenUrl).toBe(GITHUB_GRAPHQL_ENDPOINT);
    expect(seenInit?.method).toBe("POST");
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("bearer gho_token");
    expect(headers["User-Agent"]).toBe("Halero");
    expect(result.login).toBe("octocat");
    expect(result.days).toHaveLength(5);
  });

  test("throws a readable error on GraphQL errors", async () => {
    const fetch: FetchLike = async () =>
      jsonResponse({ errors: [{ message: "Bad credentials" }] });

    await expect(fetchContributions(fetch, "bad", "a", "b")).rejects.toThrow(
      "Bad credentials",
    );
  });

  test("throws a readable error on a non-200 response", async () => {
    const fetch: FetchLike = async () => jsonResponse({}, 502);
    await expect(fetchContributions(fetch, "tok", "a", "b")).rejects.toThrow(
      /502/,
    );
  });

  test("throws a readable network error when fetch rejects", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("socket hang up");
    };
    await expect(fetchContributions(fetch, "tok", "a", "b")).rejects.toThrow(
      /GitHub/,
    );
  });
});
