// The Google Calendar connector: manifest, declarative OAuth2 spec, and
// the sync generator. Pure protocol code; the host owns tokens, storage,
// transactions, cursors, sweeps, and retries.

import {
  defineConnector,
  PROTOCOL_VERSION,
  ResyncRequired,
  type StreamDef,
  type SyncContext,
  type SyncOp,
  type SyncStreamResult,
  stringOrNull,
} from "@halero/connector-sdk";
import { CALENDAR_EVENT_KIND } from "@halero/schemas";
import { z } from "zod";
import {
  discoverCalendarStreams,
  GOOGLE_CALENDAR_API_BASE,
  getJson,
  googleApiErrorMessage,
  readItems,
} from "./calendars";
import { CALENDAR_EVENT_SCHEMA_VERSION, mapGoogleEvent } from "./map-event";

const FULL_SYNC_LOOKBACK_MS = 365 * 86_400_000;
const EVENTS_PAGE_SIZE = "2500";

const MISSING_SYNC_TOKEN_MESSAGE =
  "Google Calendar's response was missing the sync token needed to " +
  "continue. Try syncing again.";

export const googleCalendarConfigSchema = z.object({
  /** All-day events land on this zone's midnights in the spine. */
  homeTimezone: z.string().min(1),
});

export type GoogleCalendarConfig = z.infer<typeof googleCalendarConfigSchema>;

const eventsUrl = (
  calendarId: string,
  params: Readonly<Record<string, string>>,
): URL => {
  const url = new URL(
    `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
  );
  // singleEvents expands recurrences server-side; we never parse RRULEs.
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("maxResults", EVENTS_PAGE_SIZE);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  return url;
};

/**
 * Walks one events listing, yielding each API page as one ops array and
 * returning the nextSyncToken (which Google only sends on the last
 * page). A 410 means the sync window expired: only a full replay can
 * recover, which is the host's call, so it surfaces as ResyncRequired.
 */
async function* paginateEvents(
  ctx: SyncContext<GoogleCalendarConfig>,
  calendarId: string,
  baseParams: Readonly<Record<string, string>>,
): AsyncGenerator<SyncOp[], string> {
  let pageToken: string | null = null;
  for (;;) {
    const params =
      pageToken === null ? baseParams : { ...baseParams, pageToken };
    const { status, body } = await getJson(
      ctx.fetch,
      eventsUrl(calendarId, params),
    );
    if (status === 410) {
      throw new ResyncRequired(googleApiErrorMessage(410));
    }
    if (status !== 200 || body === null) {
      throw new Error(googleApiErrorMessage(status));
    }
    const ops: SyncOp[] = [];
    for (const item of readItems(body)) {
      const op = mapGoogleEvent(item, calendarId, ctx.config.homeTimezone);
      if (op !== null) {
        ops.push(op);
      }
    }
    yield ops;
    pageToken = stringOrNull(body.nextPageToken);
    if (pageToken === null) {
      const syncToken = stringOrNull(body.nextSyncToken);
      if (syncToken === null) {
        throw new Error(MISSING_SYNC_TOKEN_MESSAGE);
      }
      return syncToken;
    }
  }
}

async function* syncCalendar(
  ctx: SyncContext<GoogleCalendarConfig>,
  stream: StreamDef,
  cursor?: string,
): AsyncGenerator<SyncOp[], SyncStreamResult> {
  if (cursor !== undefined) {
    const nextCursor = yield* paginateEvents(ctx, stream.id, {
      syncToken: cursor,
    });
    return { nextCursor };
  }
  // A full replay only covers events from timeMin onwards; declaring
  // that window lets the host scope its post-replay sweep to it instead
  // of tombstoning history the replay never re-yielded.
  const replayWindowStart = ctx.now() - FULL_SYNC_LOOKBACK_MS;
  const timeMin = new Date(replayWindowStart).toISOString();
  try {
    const nextCursor = yield* paginateEvents(ctx, stream.id, { timeMin });
    return { nextCursor, replayWindowStart };
  } catch (error) {
    // A 410 during a full replay cannot be fixed by yet another replay;
    // report it as a plain failure instead of requesting a resync.
    if (error instanceof ResyncRequired) {
      throw new Error(error.message);
    }
    throw error;
  }
}

export const googleCalendarConnector = defineConnector<GoogleCalendarConfig>({
  manifest: {
    id: "google-calendar",
    version: "0.1.0",
    protocolVersion: PROTOCOL_VERSION,
    capabilities: ["oauth2", "poll"],
    produces: [
      {
        kind: CALENDAR_EVENT_KIND,
        schemaVersion: CALENDAR_EVENT_SCHEMA_VERSION,
      },
    ],
  },
  auth: {
    kind: "oauth2",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
    // Both are required on every connect: without them, reconnects come
    // back from Google with no refresh token and sync dies quietly.
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  configSchema: googleCalendarConfigSchema,
  identify: (profile) => {
    const sub = stringOrNull(profile.sub);
    if (sub === null) {
      return null;
    }
    return {
      accountKey: sub,
      displayEmail: stringOrNull(profile.email) ?? undefined,
    };
  },
  discoverStreams: (ctx) => discoverCalendarStreams(ctx.fetch),
  sync: syncCalendar,
});
