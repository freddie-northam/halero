// Connector-agnostic sync engine. Resolves the connection's connector
// from the registry, hands it an auth-injecting fetch, validates its
// yielded pages and applies them in budgeted sub-transactions, and owns
// cursors, counts, sweeps, retention hooks, and error surfacing.

import {
  type ConnectorAuth,
  type DeleteSyncOp,
  type FetchLike,
  ResyncRequired,
  type StreamDef,
  type SyncContext,
  type SyncOp,
  type SyncStreamResult,
  syncOpsPageSchema,
  type UpsertSyncOp,
} from "@halero/connector-sdk";
import { createEntityStore, type EntityStore, ulid } from "@halero/core";
import {
  connections,
  entities,
  externalRefs,
  type HaleroDatabase,
  syncCursors,
  syncRuns,
} from "@halero/db";
import {
  applyUpcasts,
  assertProducedKindSupported,
  type KindRegistry,
  type RegisteredEntityKind,
} from "@halero/module-sdk/server";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { kindRegistry } from "../registry";
import { getSetting } from "../settings";
import { readApiKeyToken } from "./api-key-credential";
import {
  type ConnectionIdentity,
  type ConnectionRow,
  parseConnectionConfig,
} from "./connection";
import { getOauthAccessToken } from "./oauth-token";
import {
  type AnyConnector,
  type ConnectorRegistry,
  connectorRegistry,
} from "./registry";

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
const INTERRUPTED_MESSAGE =
  "The sync was interrupted before it could finish. Try again shortly.";
const INVALID_OPS_MESSAGE =
  "The connector produced sync data Halero could not understand. This " +
  "is a connector bug; syncing stopped.";

const unknownKindMessage = (kind: string): string =>
  `The connector produced items of kind "${kind}", which this Halero ` +
  "build does not know how to store. Update Halero.";

const satelliteMismatchMessage = (connectorId: string, kind: string): string =>
  `The "${connectorId}" connector sent "${kind}" details that do not ` +
  "match the registered shape for that kind. This is a connector bug; " +
  "syncing stopped.";

export interface SyncEngineContext {
  readonly database: HaleroDatabase;
  readonly key: Uint8Array;
  readonly now: () => number;
  /** Outbound HTTP to providers; tests inject a fake. */
  readonly outboundFetch: FetchLike;
  /**
   * Connector registry override; tests inject misbehaving fakes. The
   * type is nominal, so even injected registries have passed
   * registerConnectors validation.
   */
  readonly registry?: ConnectorRegistry;
  /** Entity kind registry override; tests inject fixture modules. */
  readonly kinds?: KindRegistry;
  /** Sink for engine and connector diagnostics; defaults to console.log. */
  readonly log?: (message: string) => void;
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
 * record ALL work actually committed during the run, at per-chunk
 * granularity, regardless of the run's outcome. Each chunk transaction
 * adds its counts here right after it commits, so a failure later in
 * the run (even later in the same page) still reports the work that
 * landed.
 */
interface RunCounts {
  upserts: number;
  deletes: number;
}

interface StreamDeps {
  readonly db: Db;
  readonly store: EntityStore;
  readonly kinds: KindRegistry;
  readonly connectorId: string;
  readonly connectionId: string;
  readonly accountKey: string;
  readonly now: () => number;
  readonly runCounts: RunCounts;
  readonly log: (message: string) => void;
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
 * Auth-injecting fetch handed to the connector. A 401 retries exactly
 * once with a forced refresh (providers sometimes drop access tokens
 * early); a second 401 fails readably. A dead refresh token surfaces
 * from getOauthAccessToken as a readable reauth error after it flips
 * the connection to reauth_required. Network failures become readable
 * errors here so connectors never see raw fetch rejections.
 */
const createAuthorizedFetch = (
  ctx: SyncEngineContext,
  connectionId: string,
  auth: ConnectorAuth,
): FetchLike => {
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
  const send = async (
    input: string | URL,
    init: RequestInit | undefined,
    headers: Headers,
  ): Promise<Response> => {
    const response = await ctx
      .outboundFetch(input, { ...init, headers })
      .catch(() => null);
    if (response === null) {
      throw new Error(NETWORK_MESSAGE);
    }
    return response;
  };
  if (auth.kind === "none") {
    // A local no-auth source: no header injection, just a network-safe
    // passthrough so connectors never see raw fetch rejections.
    return (input, init) => send(input, init, new Headers(init?.headers));
  }
  if (auth.kind === "apiKey") {
    // A static token is injected on every request; there is nothing to
    // refresh, so a 401 is a plain failure, not a retry trigger.
    const value = (token: string): string =>
      auth.scheme === undefined ? token : `${auth.scheme} ${token}`;
    return (input, init) => {
      const token = readApiKeyToken(ctx.key, loadConnection());
      const headers = new Headers(init?.headers);
      headers.set(auth.header, value(token));
      return send(input, init, headers);
    };
  }
  const tokenCtx = {
    db: ctx.database.db,
    key: ctx.key,
    now: ctx.now,
    outboundFetch: ctx.outboundFetch,
    tokenEndpoint: auth.tokenEndpoint,
  };
  const request = async (
    input: string | URL,
    init: RequestInit | undefined,
    accessToken: string,
  ): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    return send(input, init, headers);
  };
  let cachedToken: string | null = null;
  return async (input, init) => {
    if (cachedToken === null) {
      cachedToken = await getOauthAccessToken(tokenCtx, loadConnection());
    }
    let response = await request(input, init, cachedToken);
    if (response.status === 401) {
      cachedToken = await getOauthAccessToken(tokenCtx, loadConnection(), {
        forceRefresh: true,
      });
      response = await request(input, init, cachedToken);
      if (response.status === 401) {
        throw new Error(REPEATED_401_MESSAGE);
      }
    }
    return response;
  };
};

/**
 * Brings an upsert op to its kind's registered schema version. A
 * connector built against an older version keeps working: the owning
 * module's upcast chain upgrades the satellite payload step by step and
 * the row lands at the REGISTERED version. Boot validation already
 * vetted honest manifests; re-asserting per op guards against connectors
 * whose output does not match what they declared, with the same readable
 * errors.
 */
const upcastToRegistered = (
  deps: StreamDeps,
  registered: RegisteredEntityKind,
  op: UpsertSyncOp,
): UpsertSyncOp => {
  const produced = op.spine.schemaVersion;
  if (produced === registered.schemaVersion) {
    return op;
  }
  assertProducedKindSupported(deps.kinds, deps.connectorId, {
    kind: op.spine.kind,
    schemaVersion: produced,
  });
  const satellite = applyUpcasts(registered, produced, {
    ...(op.satellite ?? {}),
  });
  return {
    ...op,
    spine: { ...op.spine, schemaVersion: registered.schemaVersion },
    satellite,
  };
};

/**
 * Host-enforced kind contract: the POST-UPCAST satellite payload must
 * match the schema the owning module registered, BEFORE anything is
 * stored. The run fails with a readable message; the zod detail goes to
 * the log so connector authors can diagnose what they produced. Ops
 * without a satellite payload skip the check (spine-only is legal;
 * writers may still enforce their own needs).
 */
const validateSatellite = (
  deps: StreamDeps,
  registered: RegisteredEntityKind,
  op: UpsertSyncOp,
): void => {
  if (op.satellite === undefined) {
    return;
  }
  const parsed = registered.schema.safeParse(op.satellite);
  if (parsed.success) {
    return;
  }
  deps.log(
    `Rejected a "${op.spine.kind}" satellite payload: ${parsed.error.message}`,
  );
  throw new Error(satelliteMismatchMessage(deps.connectorId, op.spine.kind));
};

const applyUpsert = (
  deps: StreamDeps,
  streamId: string,
  op: UpsertSyncOp,
): SyncCounts => {
  const registered = deps.kinds.get(op.spine.kind);
  if (registered === undefined) {
    throw new Error(unknownKindMessage(op.spine.kind));
  }
  const current = upcastToRegistered(deps, registered, op);
  validateSatellite(deps, registered, current);
  const result = deps.store.upsertExternal({
    connectorId: deps.connectorId,
    accountKey: deps.accountKey,
    externalId: current.externalId,
    version: current.version ?? null,
    stream: streamId,
    spine: { ...current.spine, source: "connector" },
  });
  // Version-equal upserts short-circuit (and still bump last_seen_at and
  // the ref's stream, which the sweep and the moved-item guard depend
  // on); only real changes touch the satellite.
  if (result.action === "unchanged") {
    return NO_COUNTS;
  }
  // Spine-only kinds register no writer; their upsert is already stored.
  registered.satelliteWriter?.(deps.db, result.entityId, current);
  return { upserts: 1, deletes: 0 };
};

/**
 * Tombstones a deleted item, but only when its ref still points at the
 * stream being synced: an item moved between streams is reported deleted
 * by its OLD stream, and the move must win, not the tombstone. Upserts
 * from the new stream update the ref's stream first, so the stale
 * delete no-ops here.
 */
const applyDelete = (
  deps: StreamDeps,
  streamId: string,
  op: DeleteSyncOp,
): SyncCounts => {
  const key = {
    connectorId: deps.connectorId,
    accountKey: deps.accountKey,
    externalId: op.externalId,
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
  if (ref.stream !== null && ref.stream !== streamId) {
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

const applyOp = (deps: StreamDeps, streamId: string, op: SyncOp): SyncCounts =>
  op.op === "upsert"
    ? applyUpsert(deps, streamId, op)
    : applyDelete(deps, streamId, op);

/**
 * Every op is validated against the SDK schema BEFORE it is applied.
 * The run fails with a readable message; the zod detail goes to the
 * log so connector authors can diagnose what they produced.
 */
const validatePage = (
  page: SyncOp[],
  log: (message: string) => void,
): SyncOp[] => {
  const parsed = syncOpsPageSchema.safeParse(page);
  if (!parsed.success) {
    log(`Rejected a sync ops page: ${parsed.error.message}`);
    throw new Error(INVALID_OPS_MESSAGE);
  }
  return parsed.data;
};

/**
 * Write budget for Pi-class hardware: a provider page can carry up to
 * 2500 ops, far past the plan's ~200-500 ops-per-transaction budget, so
 * pages are applied in sub-transactions of at most this many ops.
 */
const MAX_OPS_PER_TRANSACTION = 250;

/** One committed chunk; a crash never loses committed chunks. */
const applyChunk = (
  deps: StreamDeps,
  streamId: string,
  ops: readonly SyncOp[],
): void => {
  const chunk = deps.store.withTransaction(() =>
    ops.reduce(
      (counts, op) => addCounts(counts, applyOp(deps, streamId, op)),
      NO_COUNTS,
    ),
  );
  // Recorded only once the chunk's transaction has committed, so a
  // failure later in the same page keeps this chunk's counts (pinned
  // RunCounts contract: committed work is always reported).
  deps.runCounts.upserts += chunk.upserts;
  deps.runCounts.deletes += chunk.deletes;
};

/** Applies one connector page as budgeted chunk transactions. */
const applyPage = async (
  deps: StreamDeps,
  streamId: string,
  ops: readonly SyncOp[],
): Promise<void> => {
  for (let start = 0; start < ops.length; start += MAX_OPS_PER_TRANSACTION) {
    if (start > 0) {
      // Yield to the event loop between chunk commits so one giant page
      // cannot starve HTTP handling for its whole duration.
      await Bun.sleep(0);
    }
    applyChunk(
      deps,
      streamId,
      ops.slice(start, start + MAX_OPS_PER_TRANSACTION),
    );
  }
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
 * After a full replay: tombstone every live entity on this stream whose
 * external ref was not seen since the replay started. Live but
 * unchanged items survive because even version-equal upserts bump
 * last_seen_at (the entity store's contract). Scoped purely by the
 * ref's stream column; no satellite peeking.
 *
 * A WINDOWED replay (the connector declared replayWindowStart) only
 * proved anything about events inside its window: an unseen ref whose
 * entity occurred before the window may simply predate the lookback, so
 * only refs with occurred_start >= replayWindowStart are swept. Rows
 * with a NULL occurred_start cannot be placed inside the window either,
 * so a windowed sweep must not touch them; SQL's three-valued NULL
 * comparison already excludes them from gte, which is relied on here on
 * purpose, not by accident.
 */
const sweepStream = (
  deps: StreamDeps,
  streamId: string,
  resyncStartedAt: number,
  replayWindowStart?: number,
): void => {
  const swept = deps.store.withTransaction(() => {
    const stale = deps.db
      .select({ externalId: externalRefs.externalId })
      .from(externalRefs)
      .innerJoin(entities, eq(entities.id, externalRefs.entityId))
      .where(
        and(
          eq(externalRefs.connectorId, deps.connectorId),
          eq(externalRefs.accountKey, deps.accountKey),
          eq(externalRefs.stream, streamId),
          isNull(entities.deletedAt),
          lt(externalRefs.lastSeenAt, resyncStartedAt),
          replayWindowStart === undefined
            ? undefined
            : gte(entities.occurredStart, replayWindowStart),
        ),
      )
      .all();
    return stale.reduce(
      (deletes, row) =>
        deps.store.tombstoneExternal({
          connectorId: deps.connectorId,
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

/**
 * Drains one connector sync generator, committing each yielded page in
 * budgeted chunk transactions, and returns the connector's stream
 * result (cursor and declared replay window) once every page landed.
 */
const consumeStream = async (
  deps: StreamDeps,
  connector: AnyConnector,
  syncCtx: SyncContext<unknown>,
  stream: StreamDef,
  cursor: string | undefined,
): Promise<SyncStreamResult> => {
  const generator = connector.sync(syncCtx, stream, cursor);
  for (;;) {
    const step = await generator.next();
    if (step.done) {
      return step.value;
    }
    await applyPage(deps, stream.id, validatePage(step.value, syncCtx.log));
    // Chunks commit synchronously; yield to the event loop between page
    // transactions too so a large resync cannot starve HTTP handling.
    await Bun.sleep(0);
  }
};

/**
 * A cursorless run is always a FULL replay: the true first sync, a
 * retry after an interrupted initial sync, a run that found the cursor
 * already cleared (crash between clearCursor and the resync), or the
 * recovery from a dead cursor. Every one of them sweeps afterwards,
 * scoped to the window the connector declared it replayed, so items
 * that vanished upstream while no cursor covered them get tombstoned.
 * On a true first sync the sweep is a natural no-op: no ref predates
 * the replay.
 */
const replayStream = async (
  deps: StreamDeps,
  connector: AnyConnector,
  syncCtx: SyncContext<unknown>,
  stream: StreamDef,
): Promise<void> => {
  // The sweep boundary is captured BEFORE the replay begins and must
  // come from Date.now(): the entity store stamps last_seen_at with
  // Date.now(), and mixing clocks would break the sweep.
  const resyncStartedAt = Date.now();
  const result = await consumeStream(
    deps,
    connector,
    syncCtx,
    stream,
    undefined,
  );
  sweepStream(deps, stream.id, resyncStartedAt, result.replayWindowStart);
  if (result.nextCursor !== undefined) {
    // The cursor lands only after every page of the stream committed.
    saveCursor(deps, stream.id, result.nextCursor);
  }
};

const syncStream = async (
  deps: StreamDeps,
  connector: AnyConnector,
  syncCtx: SyncContext<unknown>,
  stream: StreamDef,
): Promise<void> => {
  const cursor = readCursor(deps, stream.id) ?? undefined;
  if (cursor === undefined) {
    await replayStream(deps, connector, syncCtx, stream);
    return;
  }
  try {
    const result = await consumeStream(
      deps,
      connector,
      syncCtx,
      stream,
      cursor,
    );
    if (result.nextCursor !== undefined) {
      saveCursor(deps, stream.id, result.nextCursor);
    }
    return;
  } catch (error) {
    if (!(error instanceof ResyncRequired)) {
      throw error;
    }
  }
  // The connector declared the cursor dead (e.g. Google's HTTP 410).
  // Full resync, then sweep what vanished while the cursor was blind.
  clearCursor(deps, stream.id);
  await replayStream(deps, connector, syncCtx, stream);
};

interface SyncableConnection {
  readonly connection: ConnectionRow;
  readonly connector: AnyConnector;
}

const loadSyncableConnection = (
  db: Db,
  registry: ConnectorRegistry,
  connectionId: string,
): SyncableConnection => {
  const row = db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .get();
  const connector =
    row === undefined ? undefined : registry.get(row.connectorId);
  if (row === undefined || connector === undefined) {
    throw new Error(NO_CONNECTION_MESSAGE);
  }
  if (row.status !== "active") {
    throw new Error(REAUTH_GUARD_MESSAGE);
  }
  return { connection: row, connector };
};

/**
 * The host builds the connector's config from what it knows (the stored
 * account identity plus instance settings) and lets the connector's own
 * schema pick out and validate the parts it needs.
 */
const parseConnectorConfig = (
  connector: AnyConnector,
  identity: ConnectionIdentity,
  homeTimezone: string,
): unknown => {
  const candidate = {
    accountKey: identity.accountKey,
    email: identity.email,
    homeTimezone,
  };
  const parsed = connector.configSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(CONFIG_MISSING_MESSAGE);
  }
  return parsed.data;
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

const runAllStreams = async (
  deps: StreamDeps,
  connector: AnyConnector,
  syncCtx: SyncContext<unknown>,
): Promise<void> => {
  const streams = await connector.discoverStreams(syncCtx);
  for (const stream of streams) {
    await syncStream(deps, connector, syncCtx, stream);
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
 * reauth required, unusable config) throw readable errors BEFORE a run
 * row exists; once a run starts it always finishes with a finalized
 * sync_runs row and never throws.
 */
export const syncConnection = async (
  ctx: SyncEngineContext,
  connectionId: string,
): Promise<SyncRunSummary> => {
  const db = ctx.database.db;
  const { connection, connector } = loadSyncableConnection(
    db,
    ctx.registry ?? connectorRegistry,
    connectionId,
  );
  const identity = parseConnectionConfig(connection);
  if (identity === null) {
    throw new Error(CONFIG_MISSING_MESSAGE);
  }
  const homeTimezone = getSetting(db, "home_timezone") ?? "UTC";
  const log = ctx.log ?? ((message: string) => console.log(message));
  const syncCtx: SyncContext<unknown> = {
    config: parseConnectorConfig(connector, identity, homeTimezone),
    fetch: createAuthorizedFetch(ctx, connectionId, connector.auth),
    log: (message) => log(`[sync:${connection.connectorId}] ${message}`),
    now: ctx.now,
  };
  // Committed work accumulates here at page granularity so the run row
  // reports it even when a later stream or page fails (pinned contract).
  const runCounts: RunCounts = { upserts: 0, deletes: 0 };
  const deps: StreamDeps = {
    db,
    store: createEntityStore(ctx.database),
    kinds: ctx.kinds ?? kindRegistry,
    connectorId: connection.connectorId,
    connectionId,
    accountKey: identity.accountKey,
    now: ctx.now,
    runCounts,
    log: syncCtx.log,
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
    await runAllStreams(deps, connector, syncCtx);
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
