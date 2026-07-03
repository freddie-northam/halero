// Per-connector token validation for the apiKey connect flow. When a user
// pastes a token, the host runs the matching probe to confirm it works and
// to read a human account label (e.g. a GitHub login) before storing it.
// A probe throws a readable error when the token is rejected.

import { asRecord, type FetchLike, stringOrNull } from "@halero/connector-sdk";

export interface ApiKeyProbeResult {
  readonly accountLabel: string;
}

export type ApiKeyProbe = (
  fetch: FetchLike,
  token: string,
) => Promise<ApiKeyProbeResult>;

const GITHUB_GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const GITHUB_INVALID_TOKEN_MESSAGE =
  "GitHub did not accept that token. Create a token with the read:user " +
  "scope and paste it again.";
const GITHUB_UNREACHABLE_MESSAGE =
  "Halero could not reach GitHub to check the token. Check the server's " +
  "internet connection and try again.";

const githubLoginProbe: ApiKeyProbe = async (fetch, token) => {
  const response = await fetch(GITHUB_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "Halero",
    },
    body: JSON.stringify({ query: "query { viewer { login } }" }),
  }).catch(() => null);
  if (response === null) {
    throw new Error(GITHUB_UNREACHABLE_MESSAGE);
  }
  const body = asRecord(await response.json().catch(() => null));
  const viewer = body === null ? null : asRecord(body.data);
  const inner = viewer === null ? null : asRecord(viewer.viewer);
  const login = inner === null ? null : stringOrNull(inner.login);
  if (!response.ok || login === null) {
    throw new Error(GITHUB_INVALID_TOKEN_MESSAGE);
  }
  return { accountLabel: login };
};

const API_KEY_PROBES: Readonly<Record<string, ApiKeyProbe>> = {
  github: githubLoginProbe,
};

export const getApiKeyProbe = (connectorId: string): ApiKeyProbe | undefined =>
  API_KEY_PROBES[connectorId];
