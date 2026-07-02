// Calendar discovery: every calendar the account can see becomes a sync
// stream. A calendar that first appears on a later run simply becomes a
// new stream then. Removed-calendar cleanup (tombstoning a whole vanished
// stream and dropping its cursor) is deliberately deferred.

import { asRecord, googleApiErrorMessage, stringOrNull } from "./common";

export const GOOGLE_CALENDAR_API_BASE =
  "https://www.googleapis.com/calendar/v3";

const CALENDAR_LIST_PAGE_SIZE = "250";

export interface GoogleApiResponse {
  readonly status: number;
  readonly body: Record<string, unknown> | null;
}

/** Authenticated JSON GET against Google; the sync engine provides it. */
export type GoogleJsonFetch = (url: URL) => Promise<GoogleApiResponse>;

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

const calendarListUrl = (pageToken: string | null): URL => {
  const url = new URL(`${GOOGLE_CALENDAR_API_BASE}/users/me/calendarList`);
  url.searchParams.set("maxResults", CALENDAR_LIST_PAGE_SIZE);
  if (pageToken !== null) {
    url.searchParams.set("pageToken", pageToken);
  }
  return url;
};

export const discoverCalendars = async (
  getJson: GoogleJsonFetch,
): Promise<readonly string[]> => {
  const calendarIds: string[] = [];
  let pageToken: string | null = null;
  do {
    const { status, body } = await getJson(calendarListUrl(pageToken));
    if (status !== 200 || body === null) {
      throw new Error(googleApiErrorMessage(status));
    }
    for (const item of readItems(body)) {
      const id = stringOrNull(item.id);
      if (id !== null) {
        calendarIds.push(id);
      }
    }
    pageToken = stringOrNull(body.nextPageToken);
  } while (pageToken !== null);
  return calendarIds;
};
