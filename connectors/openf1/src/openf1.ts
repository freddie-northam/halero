// Minimal OpenF1 access for the connector. The durable sync only reads the
// free `meetings` and `sessions` endpoints (one request each), so there is
// no pagination or rate-limit dance here; the module's fetch-on-view code
// owns the token bucket for the heavier detail endpoints.

import { asRecord, type FetchLike } from "@halero/connector-sdk";

export const OPENF1_API_BASE = "https://api.openf1.org/v1";

const UNREACHABLE_MESSAGE =
  "Halero could not reach the OpenF1 API. Check the server's internet " +
  "connection and try again.";

/** GETs an OpenF1 collection endpoint and returns its JSON array of rows. */
export const getRows = async (
  fetch: FetchLike,
  path: string,
): Promise<readonly Record<string, unknown>[]> => {
  const response = await fetch(`${OPENF1_API_BASE}/${path}`).catch(() => null);
  if (response === null) {
    throw new Error(UNREACHABLE_MESSAGE);
  }
  if (!response.ok) {
    throw new Error(
      `OpenF1 returned ${response.status} for ${path}. Try syncing again.`,
    );
  }
  const body = await response.json().catch(() => null);
  if (!Array.isArray(body)) {
    // OpenF1 returns { detail: "No results found." } (an object) for empty
    // queries; treat that as an empty collection, not an error.
    return [];
  }
  const rows: Record<string, unknown>[] = [];
  for (const item of body) {
    const record = asRecord(item);
    if (record !== null) {
      rows.push(record);
    }
  }
  return rows;
};
