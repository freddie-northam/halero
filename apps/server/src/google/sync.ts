// Google Calendar sync engine, hardcoded inside the server for v0.1.
// One stream per (connection, calendarId); each stream keeps its own
// syncToken cursor and every API page commits as its own transaction.

import { createEntityStore, type EntityStore, ulid } from "@halero/core";
import {
  calendarEvents,
  connections,
  entities,
  externalRefs,
  type HaleroDatabase,
  syncCursors,
  syncRuns,
} from "@halero/db";
import { CALENDAR_EVENT_KIND } from "@halero/schemas";
import { and, eq, isNull, lt } from "drizzle-orm";
import { getSetting } from "../settings";
import {
  discoverCalendars,
  GOOGLE_CALENDAR_API_BASE,
  type GoogleJsonFetch,
  readItems,
} from "./calendars";
import {
  asRecord,
  type FetchLike,
  GOOGLE_CONNECTOR_ID,
  googleApiErrorMessage,
  stringOrNull,
} from "./common";
import { type ConnectionRow, parseConnectionConfig } from "./connection";
import { type CalendarEventSatellite, mapGoogleEvent } from "./map-event";
import { getGoogleAccessToken } from "./token";

const FULL_SYNC_LOOKBACK_MS = 365 * 86_400_000;
const EVENTS_PAGE_SIZE = "2500";

const NO_CONNECTION_MESSAGE =
  "There is no Google Calendar connection to sync. Connect one from Settings.";
const REAUTH_GUARD_MESSAGE =
  "Google needs a fresh sign-in before this connection can sync. " +
  "Reconnect Google Calendar from Settings.";
const CONFIG_MISSING_MESSAGE =
  "This connection is missing its Google account details. Reconnect " +
  "Google Calendar from Settings.";
const NETWORK_MESSAGE =
  "Halero could not reach Google Calendar. Check the server's internet " +
  "connection and try again.";
const REPEATED_401_MESSAGE =
  "Google rejected Halero's access twice in a row. Reconnect Google " +
  "Calendar from Settings if this keeps happening.";
const MISSING_SYNC_TOKEN_MESSAGE =
  "Google Calendar's response was missing the sync token needed to " +
  "continue. Try syncing again.";
const INTERRUPTED_MESSAGE =
  "The sync was interrupted before it could finish. Try again shortly.";

export interface SyncEngineContext {
  readonly database: HaleroDatabase;
  readonly key: Uint8Array;
  readonly now: () => number;
  readonly googleFetch: FetchLike;
}

export interface SyncRunSummary {
  readonly status: "success" | "failed";
  readonly upserts: number;
  readonly deletes: number;
  readonly error: string | null;
}

type Db = HaleroDatabase["db"];

/**
 * Mutable accumulator for the run. Pinned contract: sync_runs counts
 * record ALL work actually committed during the run, at per-page
 * granularity, regardless of the run's outcome. Each page transaction
 * adds its counts here right after it commits, so a failure later in
 * the run still reports the work that landed.
 */
interface RunCounts {
  upserts: number;
  deletes: number;
}

interface StreamDeps {
  readonly db: Db;
  readonly store: EntityStore;
  readonly getJson: GoogleJsonFetch;
  readonly connectionId: string;
  readonly accountKey: string;
  readonly homeTimezone: string;
  readonly now: () => number;
  readonly runCounts: RunCounts;
}

interface SyncCounts {
  readonly upserts: number;
  readonly deletes: number;
}

const addCounts = (a: SyncCounts, b: SyncCounts): SyncCounts => ({
  upserts: a.upserts + b.upserts,
  deletes: a.deletes + b.deletes,
});

const NO_COUNTS: SyncCounts = { upserts: 0, deletes: 0 };

/**
 * Authenticated GET wrapper around the connection's access token. A 401
 * retries exactly once with a forced refresh (Google sometimes drops
 * access tokens early); a second 401 fails readably. A dead refresh
 * token surfaces from getGoogleAccessToken as a readable reauth error
 * after it flips the connection to reauth_required.
 */
const createGoogleJsonFetch = (
  ctx: SyncEngineContext,
  connectionId: string,
): GoogleJsonFetch => {
  const tokenCtx = {
    db: ctx.database.db,
    key: ctx.key,
    now: ctx.now,
    googleFetch: ctx.googleFetch,
  };
  const loadConnection = (): ConnectionRow => {
    const row = ctx.database.db
      .select()
      .from(connections)
      .where(eq(connections.id, connectionId))
      .get();
    if (row === undefined) {
      throw new Error(NO_CONNECTION_MESSAGE);
    }
    return row;
  };
  const request = async (url: URL, accessToken: string): Promise<Response> => {
    const response = await ctx
      .googleFetch(url.toString(), {
        headers: { authorization: `Bearer ${accessToken}` },
      })
      .catch(() => null);
    if (response === null) {
      throw new Error(NETWORK_MESSAGE);
    }
    return response;
  };
  let cachedToken: string | null = null;
  return async (url) => {
    if (cachedToken === null) {
      cachedToken = await getGoogleAccessToken(tokenCtx, loadConnection());
    }
    let response = await request(url, cachedToken);
    if (response.status === 401) {
      cachedToken = await getGoogleAccessToken(tokenCtx, loadConnection(), {
        forceRefresh: true,
      });
      response = await request(url, cachedToken);
      if (response.status === 401) {
        throw new Error(REPEATED_401_MESSAGE);
      }
    }
    const body = asRecord(await response.json().catch(() => null));
    return { status: response.status, body };
  };
};

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

const upsertSatellite = (
  db: Db,
  entityId: string,
  satellite: CalendarEventSatellite,
): void => {
  const values = { entityId, ...satellite };
  db.insert(calendarEvents)
    .values(values)
    .onConflictDoUpdate({ target: calendarEvents.entityId, set: values })
    .run();
};

/**
 * Tombstones a cancelled event, but only when the entity's satellite
 * still points at the calendar being synced: an event moved between
 * calendars is reported cancelled by its OLD calendar, and the move
 * must win, not the tombstone.
 */
const applyCancellation = (
  deps: StreamDeps,
  calendarId: string,
  externalId: string,
): SyncCounts => {
  const key = {
    connectorId: GOOGLE_CONNECTOR_ID,
    accountKey: deps.accountKey,
    externalId,
  };
  const ref = deps.db
    .select()
    .from(externalRefs)
    .where(
      and(
        eq(externalRefs.connectorId, key.connectorId),
        eq(externalRefs.accountKey, key.accountKey),
        eq(externalRefs.externalId, key.externalId),
      ),
    )
    .get();
  if (ref === undefined) {
    return NO_COUNTS;
  }
  const satellite = deps.db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.entityId, ref.entityId))
    .get();
  if (satellite !== undefined && satellite.calendarId !== calendarId) {
    return NO_COUNTS;
  }
  const entity = deps.store.getEntity(ref.entityId);
  if (entity !== null && entity.deletedAt !== null) {
    return NO_COUNTS;
  }
  return deps.store.tombstoneExternal(key) === null
    ? NO_COUNTS
    : { upserts: 0, deletes: 1 };
};

const applyEvent = (
  deps: StreamDeps,
  calendarId: string,
  item: Record<string, unknown>,
): SyncCounts => {
  const mapped = mapGoogleEvent(item, calendarId, deps.homeTimezone);
  if (mapped === null) {
    return NO_COUNTS;
  }
  if (mapped.kind === "cancelled") {
    return applyCancellation(deps, calendarId, mapped.externalId);
  }
  const result = deps.store.upsertExternal({
    connectorId: GOOGLE_CONNECTOR_ID,
    accountKey: deps.accountKey,
    externalId: mapped.externalId,
    version: mapped.etag,
    spine: mapped.spine,
  });
  // Version-equal upserts short-circuit (and still bump last_seen_at,
  // which the 410 sweep depends on); only real changes touch the satellite.
  if (result.action === "unchanged") {
    return NO_COUNTS;
  }
  upsertSatellite(deps.db, result.entityId, mapped.satellite);
  return { upserts: 1, deletes: 0 };
};

/** One API page = one transaction; a crash never loses committed pages. */
const processEventsPage = (
  deps: StreamDeps,
  calendarId: string,
  items: readonly Record<string, unknown>[],
): void => {
  const page = deps.store.withTransaction(() =>
    items.reduce(
      (counts, item) => addCounts(counts, applyEvent(deps, calendarId, item)),
      NO_COUNTS,
    ),
  );
  // Recorded only once the page's transaction has committed.
  deps.runCounts.upserts += page.upserts;
  deps.runCounts.deletes += page.deletes;
};

type PaginationOutcome =
  | { readonly kind: "complete"; readonly syncToken: string }
  | { readonly kind: "gone" };

const paginateEvents = async (
  deps: StreamDeps,
  calendarId: string,
  baseParams: Readonly<Record<string, string>>,
): Promise<PaginationOutcome> => {
  let pageToken: string | null = null;
  for (;;) {
    const params =
      pageToken === null ? baseParams : { ...baseParams, pageToken };
    const { status, body } = await deps.getJson(eventsUrl(calendarId, params));
    if (status === 410) {
      return { kind: "gone" };
    }
    if (status !== 200 || body === null) {
      throw new Error(googleApiErrorMessage(status));
    }
    processEventsPage(deps, calendarId, readItems(body));
    pageToken = stringOrNull(body.nextPageToken);
    if (pageToken === null) {
      // nextSyncToken only ever arrives on the last page.
      const syncToken = stringOrNull(body.nextSyncToken);
      if (syncToken === null) {
        throw new Error(MISSING_SYNC_TOKEN_MESSAGE);
      }
      return { kind: "complete", syncToken };
    }
  }
};

const runFullSync = async (
  deps: StreamDeps,
  calendarId: string,
): Promise<string> => {
  const timeMin = new Date(deps.now() - FULL_SYNC_LOOKBACK_MS).toISOString();
  const outcome = await paginateEvents(deps, calendarId, { timeMin });
  if (outcome.kind === "gone") {
    throw new Error(googleApiErrorMessage(410));
  }
  return outcome.syncToken;
};

const readCursor = (deps: StreamDeps, stream: string): string | null =>
  deps.db
    .select()
    .from(syncCursors)
    .where(
      and(
        eq(syncCursors.connectionId, deps.connectionId),
        eq(syncCursors.stream, stream),
      ),
    )
    .get()?.cursor ?? null;

const saveCursor = (deps: StreamDeps, stream: string, cursor: string): void => {
  deps.db
    .insert(syncCursors)
    .values({
      connectionId: deps.connectionId,
      stream,
      cursor,
      updatedAt: deps.now(),
    })
    .onConflictDoUpdate({
      target: [syncCursors.connectionId, syncCursors.stream],
      set: { cursor, updatedAt: deps.now() },
    })
    .run();
};

const clearCursor = (deps: StreamDeps, stream: string): void => {
  deps.db
    .delete(syncCursors)
    .where(
      and(
        eq(syncCursors.connectionId, deps.connectionId),
        eq(syncCursors.stream, stream),
      ),
    )
    .run();
};

/**
 * After a 410 full resync: tombstone every live entity on this stream
 * whose external ref was not seen since the resync started. Live but
 * unchanged events survive because even version-equal upserts bump
 * last_seen_at (the entity store's contract).
 */
const sweepStream = (
  deps: StreamDeps,
  calendarId: string,
  resyncStartedAt: number,
): void => {
  const swept = deps.store.withTransaction(() => {
    const stale = deps.db
      .select({ externalId: externalRefs.externalId })
      .from(externalRefs)
      .innerJoin(
        calendarEvents,
        eq(calendarEvents.entityId, externalRefs.entityId),
      )
      .innerJoin(entities, eq(entities.id, externalRefs.entityId))
      .where(
        and(
          eq(externalRefs.connectorId, GOOGLE_CONNECTOR_ID),
          eq(externalRefs.accountKey, deps.accountKey),
          eq(calendarEvents.calendarId, calendarId),
          // The satellite join already implies the kind, but the sweep
          // deletes data: state the intent explicitly rather than rely
          // on that implication.
          eq(entities.kind, CALENDAR_EVENT_KIND),
          isNull(entities.deletedAt),
          lt(externalRefs.lastSeenAt, resyncStartedAt),
        ),
      )
      .all();
    return stale.reduce(
      (deletes, row) =>
        deps.store.tombstoneExternal({
          connectorId: GOOGLE_CONNECTOR_ID,
          accountKey: deps.accountKey,
          externalId: row.externalId,
        }) === null
          ? deletes
          : deletes + 1,
      0,
    );
  });
  // Recorded only once the sweep's transaction has committed.
  deps.runCounts.deletes += swept;
};

const syncStream = async (
  deps: StreamDeps,
  calendarId: string,
): Promise<void> => {
  const cursor = readCursor(deps, calendarId);
  if (cursor === null) {
    const syncToken = await runFullSync(deps, calendarId);
    // The cursor lands only after every page of the stream has committed.
    saveCursor(deps, calendarId, syncToken);
    return;
  }
  const incremental = await paginateEvents(deps, calendarId, {
    syncToken: cursor,
  });
  if (incremental.kind === "complete") {
    saveCursor(deps, calendarId, incremental.syncToken);
    return;
  }
  // HTTP 410: Google expired the sync token. Full resync, then sweep.
  clearCursor(deps, calendarId);
  // The boundary must come from Date.now(): the entity store stamps
  // last_seen_at with Date.now(), and mixing clocks would break the sweep.
  const resyncStartedAt = Date.now();
  const syncToken = await runFullSync(deps, calendarId);
  sweepStream(deps, calendarId, resyncStartedAt);
  saveCursor(deps, calendarId, syncToken);
};

const loadSyncableConnection = (
  db: Db,
  connectionId: string,
): ConnectionRow => {
  const row = db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .get();
  if (row === undefined || row.connectorId !== GOOGLE_CONNECTOR_ID) {
    throw new Error(NO_CONNECTION_MESSAGE);
  }
  if (row.status !== "active") {
    throw new Error(REAUTH_GUARD_MESSAGE);
  }
  return row;
};

const finalizeRun = (
  db: Db,
  runId: string,
  summary: SyncRunSummary,
  finishedAt: number,
): void => {
  db.update(syncRuns)
    .set({
      finishedAt,
      status: summary.status,
      upserts: summary.upserts,
      deletes: summary.deletes,
      error: summary.error,
    })
    .where(eq(syncRuns.id, runId))
    .run();
};

const readableSyncError = (error: unknown): string =>
  error instanceof Error && error.message.trim() !== ""
    ? error.message
    : "Syncing failed for an unknown reason. Try again shortly.";

const runAllStreams = async (deps: StreamDeps): Promise<void> => {
  const calendarIds = await discoverCalendars(deps.getJson);
  for (const calendarId of calendarIds) {
    await syncStream(deps, calendarId);
  }
};

const startRun = (db: Db, connectionId: string, startedAt: number): string => {
  const runId = ulid(startedAt);
  db.insert(syncRuns)
    .values({ id: runId, connectionId, startedAt, status: "running" })
    .run();
  return runId;
};

const setLastError = (
  db: Db,
  connectionId: string,
  message: string | null,
): void => {
  db.update(connections)
    .set({ lastError: message })
    .where(eq(connections.id, connectionId))
    .run();
};

/**
 * Runs one sync for the connection. Guard failures (missing connection,
 * reauth required) throw readable errors BEFORE a run row exists; once
 * a run starts it always finishes with a finalized sync_runs row and
 * never throws.
 */
export const syncConnection = async (
  ctx: SyncEngineContext,
  connectionId: string,
): Promise<SyncRunSummary> => {
  const db = ctx.database.db;
  const connection = loadSyncableConnection(db, connectionId);
  const config = parseConnectionConfig(connection);
  if (config === null) {
    throw new Error(CONFIG_MISSING_MESSAGE);
  }
  // Committed work accumulates here at page granularity so the run row
  // reports it even when a later stream or page fails (pinned contract).
  const runCounts: RunCounts = { upserts: 0, deletes: 0 };
  const deps: StreamDeps = {
    db,
    store: createEntityStore(ctx.database),
    getJson: createGoogleJsonFetch(ctx, connectionId),
    connectionId,
    accountKey: config.accountKey,
    homeTimezone: getSetting(db, "home_timezone") ?? "UTC",
    now: ctx.now,
    runCounts,
  };
  const runId = startRun(db, connectionId, ctx.now());
  let error: string | null = INTERRUPTED_MESSAGE;
  const summarize = (): SyncRunSummary => ({
    status: error === null ? "success" : "failed",
    upserts: runCounts.upserts,
    deletes: runCounts.deletes,
    error,
  });
  try {
    await runAllStreams(deps);
    error = null;
    setLastError(db, connectionId, null);
  } catch (caught) {
    error = readableSyncError(caught);
    setLastError(db, connectionId, error);
  } finally {
    finalizeRun(db, runId, summarize(), ctx.now());
  }
  return summarize();
};
