// Calendar discovery: every calendar the account can see becomes a sync
// stream. A calendar that first appears on a later run simply becomes a
// new stream then. Removed-calendar cleanup (tombstoning a whole vanished
// stream and dropping its cursor) is deliberately deferred.

import {
  asRecord,
  type FetchLike,
  type StreamDef,
  stringOrNull,
} from "@halero/connector-sdk";

export const GOOGLE_CALENDAR_API_BASE =
  "https://www.googleapis.com/calendar/v3";

const CALENDAR_LIST_PAGE_SIZE = "250";

export interface GoogleApiResponse {
  readonly status: number;
  readonly body: Record<string, unknown> | null;
}

/** One authenticated JSON GET; the host's fetch already injects auth. */
export const getJson = async (
  fetchLike: FetchLike,
  url: URL,
): Promise<GoogleApiResponse> => {
  const response = await fetchLike(url.toString());
  const body = asRecord(await response.json().catch(() => null));
  return { status: response.status, body };
};

/** The `items` array of a Google list response, dropping non-objects. */
export const readItems = (
  body: Record<string, unknown> | null,
): readonly Record<string, unknown>[] => {
  if (body === null || !Array.isArray(body.items)) {
    return [];
  }
  const records: Record<string, unknown>[] = [];
  for (const item of body.items) {
    const record = asRecord(item);
    if (record !== null) {
      records.push(record);
    }
  }
  return records;
};

export const googleApiErrorMessage = (status: number): string =>
  `Google Calendar returned an unexpected response (HTTP ${status}) ` +
  "while syncing. This is usually temporary; try again shortly.";

const calendarListUrl = (pageToken: string | null): URL => {
  const url = new URL(`${GOOGLE_CALENDAR_API_BASE}/users/me/calendarList`);
  url.searchParams.set("maxResults", CALENDAR_LIST_PAGE_SIZE);
  if (pageToken !== null) {
    url.searchParams.set("pageToken", pageToken);
  }
  return url;
};

export const discoverCalendarStreams = async (
  fetchLike: FetchLike,
): Promise<StreamDef[]> => {
  const streams: StreamDef[] = [];
  let pageToken: string | null = null;
  do {
    const { status, body } = await getJson(
      fetchLike,
      calendarListUrl(pageToken),
    );
    if (status !== 200 || body === null) {
      throw new Error(googleApiErrorMessage(status));
    }
    for (const item of readItems(body)) {
      const id = stringOrNull(item.id);
      if (id !== null) {
        streams.push({
          id,
          displayName: stringOrNull(item.summary) ?? undefined,
        });
      }
    }
    pageToken = stringOrNull(body.nextPageToken);
  } while (pageToken !== null);
  return streams;
};
