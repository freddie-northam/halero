// Live GitHub "work" reads for the Developer page: the review queue, my
// open PRs (+ CI), assigned issues, and per-repo contribution totals. Pure
// parsing plus a fetch-injected GraphQL client, like github.ts. These need a
// broader token than the contributions read (they touch PRs/issues), so a
// 403 or an insufficient-scopes GraphQL error surfaces as GithubScopeError,
// which the router turns into a "reconnect with more access" prompt.

import { asRecord, type FetchLike, stringOrNull } from "@halero/connector-sdk";
import { GITHUB_GRAPHQL_ENDPOINT } from "./github";

/** Thrown when the stored token lacks the scope to read PRs/issues. */
export class GithubScopeError extends Error {}

const SCOPE_MESSAGE =
  "Halero needs more GitHub access. Reconnect GitHub with a token that can " +
  "read your pull requests and issues.";

export type ChecksState = "success" | "failure" | "pending" | "none";

export interface WorkItem {
  readonly title: string;
  readonly repo: string;
  readonly number: number;
  readonly url: string;
  readonly updatedAt: string;
}

export interface PullRequestItem extends WorkItem {
  readonly reviewDecision: string | null;
  readonly checks: ChecksState;
}

export interface RepoStat {
  readonly repo: string;
  readonly contributions: number;
}

const numberOrZero = (value: unknown): number =>
  typeof value === "number" ? value : 0;

// A shared authed GraphQL POST. Returns the `data` object; throws readable
// errors, with scope problems (HTTP 403 or a GraphQL INSUFFICIENT_SCOPES /
// FORBIDDEN error) raised as GithubScopeError.
const postGraphql = async (
  fetch: FetchLike,
  token: string,
  query: string,
): Promise<Record<string, unknown>> => {
  let response: Response;
  try {
    response = await fetch(GITHUB_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "Halero",
      },
      body: JSON.stringify({ query }),
    });
  } catch (cause) {
    throw new Error("Could not reach GitHub.", { cause });
  }
  if (response.status === 403 || response.status === 401) {
    throw new GithubScopeError(SCOPE_MESSAGE);
  }
  if (!response.ok) {
    throw new Error(`GitHub request failed (HTTP ${response.status}).`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new Error("GitHub returned an unreadable response.", { cause });
  }
  const errors = asRecord(body)?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = asRecord(errors[0]);
    const type = stringOrNull(first?.type);
    if (type === "INSUFFICIENT_SCOPES" || type === "FORBIDDEN") {
      throw new GithubScopeError(SCOPE_MESSAGE);
    }
    throw new Error(
      `GitHub error: ${stringOrNull(first?.message) ?? "unknown"}.`,
    );
  }
  return asRecord(asRecord(body)?.data) ?? {};
};

const searchQuery = (filter: string, prFields: string): string =>
  `query { search(query: ${JSON.stringify(filter)}, type: ISSUE, first: 25) { nodes { __typename ${prFields} } } }`;

const ISSUE_FIELDS =
  "... on Issue { title number url updatedAt repository { nameWithOwner } }";
const PR_CORE =
  "... on PullRequest { title number url updatedAt repository { nameWithOwner }";
const PR_WITH_STATUS = `${PR_CORE} reviewDecision commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }`;
const PR_PLAIN = `${PR_CORE} }`;

export const buildReviewRequestsQuery = (): string =>
  searchQuery("is:open is:pr review-requested:@me", PR_PLAIN);
export const buildMyPullRequestsQuery = (): string =>
  searchQuery("is:open is:pr author:@me", PR_WITH_STATUS);
export const buildAssignedIssuesQuery = (): string =>
  searchQuery("is:open is:issue assignee:@me", ISSUE_FIELDS);

export const buildRepositoriesQuery = (): string =>
  `query { viewer { contributionsCollection {
    commitContributionsByRepository(maxRepositories: 25) { repository { nameWithOwner } contributions { totalCount } }
    pullRequestContributionsByRepository(maxRepositories: 25) { repository { nameWithOwner } contributions { totalCount } }
    issueContributionsByRepository(maxRepositories: 25) { repository { nameWithOwner } contributions { totalCount } }
  } } }`;

const baseWorkItem = (node: Record<string, unknown>): WorkItem | null => {
  const title = stringOrNull(node.title);
  const url = stringOrNull(node.url);
  const repo = stringOrNull(asRecord(node.repository)?.nameWithOwner);
  const number = node.number;
  if (title === null || url === null || repo === null) return null;
  return {
    title,
    repo,
    url,
    number: typeof number === "number" ? number : 0,
    updatedAt: stringOrNull(node.updatedAt) ?? "",
  };
};

const searchNodes = (
  data: Record<string, unknown>,
): Record<string, unknown>[] => {
  const nodes = asRecord(data.search)?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map(asRecord)
    .filter((n): n is Record<string, unknown> => n !== null);
};

export const mapWorkItems = (data: Record<string, unknown>): WorkItem[] => {
  const items: WorkItem[] = [];
  for (const node of searchNodes(data)) {
    const item = baseWorkItem(node);
    if (item !== null) items.push(item);
  }
  return items;
};

// node.commits.nodes[0].commit.statusCheckRollup.state
const checksOf = (node: Record<string, unknown>): ChecksState => {
  const nodes = asRecord(node.commits)?.nodes;
  const first = Array.isArray(nodes) ? asRecord(nodes[0]) : null;
  const rollup = asRecord(asRecord(first?.commit)?.statusCheckRollup);
  switch (stringOrNull(rollup?.state)) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "ERROR":
      return "failure";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return "none";
  }
};

export const mapPullRequests = (
  data: Record<string, unknown>,
): PullRequestItem[] => {
  const items: PullRequestItem[] = [];
  for (const node of searchNodes(data)) {
    const base = baseWorkItem(node);
    if (base === null) continue;
    items.push({
      ...base,
      reviewDecision: stringOrNull(node.reviewDecision),
      checks: checksOf(node),
    });
  }
  return items;
};

export const mapRepositories = (data: Record<string, unknown>): RepoStat[] => {
  const collection = asRecord(asRecord(data.viewer)?.contributionsCollection);
  if (collection === null) return [];
  const totals = new Map<string, number>();
  const add = (key: string): void => {
    const list = collection[key];
    if (!Array.isArray(list)) return;
    for (const entry of list) {
      const record = asRecord(entry);
      const repo = stringOrNull(asRecord(record?.repository)?.nameWithOwner);
      if (repo === null) continue;
      const count = numberOrZero(asRecord(record?.contributions)?.totalCount);
      totals.set(repo, (totals.get(repo) ?? 0) + count);
    }
  };
  add("commitContributionsByRepository");
  add("pullRequestContributionsByRepository");
  add("issueContributionsByRepository");
  return [...totals.entries()]
    .map(([repo, contributions]) => ({ repo, contributions }))
    .sort((a, b) => b.contributions - a.contributions);
};

export const fetchReviewRequests = async (
  fetch: FetchLike,
  token: string,
): Promise<WorkItem[]> =>
  mapWorkItems(await postGraphql(fetch, token, buildReviewRequestsQuery()));

export const fetchMyPullRequests = async (
  fetch: FetchLike,
  token: string,
): Promise<PullRequestItem[]> =>
  mapPullRequests(await postGraphql(fetch, token, buildMyPullRequestsQuery()));

export const fetchAssignedIssues = async (
  fetch: FetchLike,
  token: string,
): Promise<WorkItem[]> =>
  mapWorkItems(await postGraphql(fetch, token, buildAssignedIssuesQuery()));

export const fetchRepositories = async (
  fetch: FetchLike,
  token: string,
): Promise<RepoStat[]> =>
  mapRepositories(await postGraphql(fetch, token, buildRepositoriesQuery()));
