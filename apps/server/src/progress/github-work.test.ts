import { describe, expect, test } from "bun:test";
import type { FetchLike } from "@halero/connector-sdk";
import {
  fetchMyPullRequests,
  fetchRepositories,
  fetchReviewRequests,
  GithubScopeError,
  mapPullRequests,
  mapRepositories,
  mapWorkItems,
} from "./github-work";

const fakeFetch =
  (body: unknown, status = 200): FetchLike =>
  () =>
    Promise.resolve(Response.json(body, { status }));

const prNode = (over: Record<string, unknown> = {}) => ({
  __typename: "PullRequest",
  title: "Fix auth",
  number: 214,
  url: "https://github.com/acme/api/pull/214",
  updatedAt: "2026-07-03T10:00:00Z",
  repository: { nameWithOwner: "acme/api" },
  reviewDecision: "REVIEW_REQUIRED",
  commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
  ...over,
});

describe("mapWorkItems", () => {
  test("pulls title/repo/number/url from issue + PR nodes", () => {
    const items = mapWorkItems({
      search: {
        nodes: [
          {
            __typename: "Issue",
            title: "Login 500s",
            number: 300,
            url: "https://github.com/acme/api/issues/300",
            updatedAt: "2026-07-02T09:00:00Z",
            repository: { nameWithOwner: "acme/api" },
          },
          { __typename: "PullRequest", title: null }, // malformed, skipped
        ],
      },
    });
    expect(items).toEqual([
      {
        title: "Login 500s",
        repo: "acme/api",
        number: 300,
        url: "https://github.com/acme/api/issues/300",
        updatedAt: "2026-07-02T09:00:00Z",
      },
    ]);
  });
});

describe("mapPullRequests", () => {
  test("maps reviewDecision and rolls up check state", () => {
    const items = mapPullRequests({
      search: {
        nodes: [
          prNode(),
          prNode({
            title: "Docs",
            number: 88,
            commits: {
              nodes: [{ commit: { statusCheckRollup: { state: "FAILURE" } } }],
            },
          }),
          prNode({ title: "WIP", number: 90, commits: { nodes: [] } }),
        ],
      },
    });
    expect(items.map((i) => [i.title, i.reviewDecision, i.checks])).toEqual([
      ["Fix auth", "REVIEW_REQUIRED", "success"],
      ["Docs", "REVIEW_REQUIRED", "failure"],
      ["WIP", "REVIEW_REQUIRED", "none"],
    ]);
  });
});

describe("mapRepositories", () => {
  test("sums per-repo contributions across categories, sorted desc", () => {
    const repos = mapRepositories({
      viewer: {
        contributionsCollection: {
          commitContributionsByRepository: [
            {
              repository: { nameWithOwner: "acme/web" },
              contributions: { totalCount: 40 },
            },
            {
              repository: { nameWithOwner: "acme/api" },
              contributions: { totalCount: 10 },
            },
          ],
          pullRequestContributionsByRepository: [
            {
              repository: { nameWithOwner: "acme/api" },
              contributions: { totalCount: 5 },
            },
          ],
          issueContributionsByRepository: [
            {
              repository: { nameWithOwner: "acme/api" },
              contributions: { totalCount: 2 },
            },
          ],
        },
      },
    });
    expect(repos).toEqual([
      { repo: "acme/web", contributions: 40 },
      { repo: "acme/api", contributions: 17 },
    ]);
  });
});

describe("fetch functions", () => {
  test("fetchReviewRequests returns mapped work items", async () => {
    const items = await fetchReviewRequests(
      fakeFetch({ data: { search: { nodes: [prNode()] } } }),
      "tok",
    );
    expect(items[0]?.repo).toBe("acme/api");
  });

  test("fetchMyPullRequests maps checks", async () => {
    const items = await fetchMyPullRequests(
      fakeFetch({ data: { search: { nodes: [prNode()] } } }),
      "tok",
    );
    expect(items[0]?.checks).toBe("success");
  });

  test("fetchRepositories aggregates", async () => {
    const repos = await fetchRepositories(
      fakeFetch({
        data: {
          viewer: {
            contributionsCollection: {
              commitContributionsByRepository: [
                {
                  repository: { nameWithOwner: "a/b" },
                  contributions: { totalCount: 3 },
                },
              ],
            },
          },
        },
      }),
      "tok",
    );
    expect(repos).toEqual([{ repo: "a/b", contributions: 3 }]);
  });

  test("a 403 raises GithubScopeError", async () => {
    await expect(
      fetchReviewRequests(fakeFetch({ message: "Forbidden" }, 403), "tok"),
    ).rejects.toBeInstanceOf(GithubScopeError);
  });

  test("a GraphQL INSUFFICIENT_SCOPES error raises GithubScopeError", async () => {
    await expect(
      fetchMyPullRequests(
        fakeFetch({ errors: [{ type: "INSUFFICIENT_SCOPES", message: "no" }] }),
        "tok",
      ),
    ).rejects.toBeInstanceOf(GithubScopeError);
  });

  test("a network failure surfaces a readable error", async () => {
    const rejectingFetch: FetchLike = () => Promise.reject(new Error("down"));
    await expect(fetchAssignedIssuesSafe(rejectingFetch)).rejects.toThrow(
      /reach GitHub/i,
    );
  });
});

// Small wrapper so the network-failure test reads clearly.
const fetchAssignedIssuesSafe = (fetch: FetchLike) =>
  fetchReviewRequests(fetch, "tok");
