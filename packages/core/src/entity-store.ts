import {
  entities,
  entityAliases,
  externalRefs,
  type HaleroDatabase,
  links,
} from "@halero/db";
import { and, eq, or } from "drizzle-orm";
import { ulid } from "./ulid";

export type EntityRow = typeof entities.$inferSelect;
export type LinkRow = typeof links.$inferSelect;

export interface ExternalRefKey {
  readonly connectorId: string;
  readonly accountKey: string;
  readonly externalId: string;
}

export interface SpineInput {
  readonly kind: string;
  readonly schemaVersion: number;
  readonly title?: string | null;
  readonly snippet?: string | null;
  readonly occurredStart?: number | null;
  readonly occurredEnd?: number | null;
  readonly source: "connector";
}

export interface UpsertExternalInput extends ExternalRefKey {
  readonly version?: string | null;
  /**
   * The connection stream that observed this item (e.g. a calendar id).
   * Recorded on every upsert, including version-equal ones, so a moved
   * item's ref always names the stream that saw it last. An explicit
   * value (including null) always wins; OMITTING the field preserves
   * the ref's existing stream, so a stream-unaware caller can never
   * strip provenance and make the ref tombstonable from any stream.
   */
  readonly stream?: string | null;
  readonly spine: SpineInput;
}

export type UpsertAction = "created" | "updated" | "unchanged";

export interface UpsertExternalResult {
  readonly entityId: string;
  readonly action: UpsertAction;
}

export interface CreateLinkInput {
  readonly fromId: string;
  readonly toId: string;
  readonly kind: string;
  readonly source: string;
  readonly metadata?: string | null;
}

export interface CreateUserEntityInput {
  readonly kind: string;
  readonly schemaVersion: number;
  readonly title?: string;
  readonly snippet?: string;
  readonly occurredStart?: number;
  readonly occurredEnd?: number;
}

/**
 * Omitted fields preserve their stored values (the streamPatch
 * precedent); an explicit null clears the nullable occurred fields.
 */
export interface UpdateUserEntityPatch {
  readonly title?: string;
  readonly snippet?: string;
  readonly occurredStart?: number | null;
  readonly occurredEnd?: number | null;
}

export interface EntityStore {
  withTransaction<T>(fn: () => T): T;
  upsertExternal(input: UpsertExternalInput): UpsertExternalResult;
  tombstoneExternal(key: ExternalRefKey): { entityId: string } | null;
  createUserEntity(input: CreateUserEntityInput): { entityId: string };
  updateUserEntity(id: string, patch: UpdateUserEntityPatch): void;
  deleteUserEntity(id: string): void;
  getEntity(id: string): EntityRow | null;
  resolveAlias(id: string): string;
  createLink(input: CreateLinkInput): LinkRow;
  deleteLink(id: string): void;
  getLinksFor(entityId: string): LinkRow[];
}

/** Empty when the caller omitted the stream: omission preserves. */
const streamPatch = (input: UpsertExternalInput): { stream?: string | null } =>
  input.stream === undefined ? {} : { stream: input.stream };

const spineValues = (spine: SpineInput) => ({
  kind: spine.kind,
  schemaVersion: spine.schemaVersion,
  title: spine.title ?? null,
  snippet: spine.snippet ?? null,
  occurredStart: spine.occurredStart ?? null,
  occurredEnd: spine.occurredEnd ?? null,
  source: spine.source,
});

type DrizzleDb = HaleroDatabase["db"];

const USER_ENTITY_MISSING_MESSAGE = "This item could not be found.";
const USER_ENTITY_DELETED_MESSAGE = "This item was deleted.";
const CONNECTOR_MANAGED_MESSAGE =
  "This item is managed by a connector sync and cannot be edited.";

const insertUserEntity = (
  db: DrizzleDb,
  input: CreateUserEntityInput,
): { entityId: string } => {
  const now = Date.now();
  const entityId = ulid(now);
  db.insert(entities)
    .values({
      id: entityId,
      kind: input.kind,
      schemaVersion: input.schemaVersion,
      title: input.title ?? null,
      snippet: input.snippet ?? null,
      occurredStart: input.occurredStart ?? null,
      occurredEnd: input.occurredEnd ?? null,
      source: "user",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();
  return { entityId };
};

/**
 * Loads the row behind a user write and rejects what no user write may
 * touch: a missing entity and a connector-managed one. Tombstones stay
 * with the caller because update and delete disagree about them
 * (update rejects, delete treats a repeat as a no-op).
 */
const requireUserManagedEntity = (db: DrizzleDb, id: string): EntityRow => {
  const row = db.select().from(entities).where(eq(entities.id, id)).get();
  if (row === undefined) {
    throw new Error(USER_ENTITY_MISSING_MESSAGE);
  }
  if (row.source === "connector") {
    throw new Error(CONNECTOR_MANAGED_MESSAGE);
  }
  return row;
};

/** Empty per omitted field: omission preserves (streamPatch precedent). */
const userEntityPatchValues = (patch: UpdateUserEntityPatch) => ({
  ...(patch.title === undefined ? {} : { title: patch.title }),
  ...(patch.snippet === undefined ? {} : { snippet: patch.snippet }),
  ...(patch.occurredStart === undefined
    ? {}
    : { occurredStart: patch.occurredStart }),
  ...(patch.occurredEnd === undefined
    ? {}
    : { occurredEnd: patch.occurredEnd }),
});

const applyUserEntityUpdate = (
  db: DrizzleDb,
  id: string,
  patch: UpdateUserEntityPatch,
): void => {
  const row = requireUserManagedEntity(db, id);
  if (row.deletedAt !== null) {
    throw new Error(USER_ENTITY_DELETED_MESSAGE);
  }
  db.update(entities)
    .set({ ...userEntityPatchValues(patch), updatedAt: Date.now() })
    .where(eq(entities.id, id))
    .run();
};

const applyUserEntityDelete = (db: DrizzleDb, id: string): void => {
  const row = requireUserManagedEntity(db, id);
  if (row.deletedAt !== null) {
    return;
  }
  db.update(entities)
    .set({ deletedAt: Date.now() })
    .where(eq(entities.id, id))
    .run();
};

export const createEntityStore = (handle: HaleroDatabase): EntityStore => {
  const { sqlite, db } = handle;

  const withTransaction = <T>(fn: () => T): T => sqlite.transaction(fn)();

  const refWhere = (key: ExternalRefKey) =>
    and(
      eq(externalRefs.connectorId, key.connectorId),
      eq(externalRefs.accountKey, key.accountKey),
      eq(externalRefs.externalId, key.externalId),
    );

  const findRef = (key: ExternalRefKey) =>
    db.select().from(externalRefs).where(refWhere(key)).get();

  const createFromExternal = (
    input: UpsertExternalInput,
  ): UpsertExternalResult => {
    const now = Date.now();
    const entityId = ulid(now);
    db.insert(entities)
      .values({
        id: entityId,
        ...spineValues(input.spine),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
    db.insert(externalRefs)
      .values({
        connectorId: input.connectorId,
        accountKey: input.accountKey,
        externalId: input.externalId,
        entityId,
        version: input.version ?? null,
        lastSeenAt: now,
        stream: input.stream ?? null,
      })
      .run();
    return { entityId, action: "created" };
  };

  const updateFromExternal = (
    input: UpsertExternalInput,
    entityId: string,
  ): UpsertExternalResult => {
    const now = Date.now();
    db.update(entities)
      .set({ ...spineValues(input.spine), updatedAt: now, deletedAt: null })
      .where(eq(entities.id, entityId))
      .run();
    db.update(externalRefs)
      .set({
        version: input.version ?? null,
        lastSeenAt: now,
        ...streamPatch(input),
      })
      .where(refWhere(input))
      .run();
    return { entityId, action: "updated" };
  };

  const upsertExternal = (input: UpsertExternalInput): UpsertExternalResult =>
    withTransaction(() => {
      const existing = findRef(input);
      if (existing === undefined) {
        return createFromExternal(input);
      }
      const version = input.version ?? null;
      if (version !== null && existing.version === version) {
        // last_seen_at records observation, not mutation: a full resync
        // sweeps refs not seen since it started, so live-but-unchanged
        // items must still refresh it to survive the sweep. The stream
        // follows for the same reason: a version-equal sighting from a
        // new stream must move the ref there so stale deletes from the
        // old stream cannot win.
        db.update(externalRefs)
          .set({ lastSeenAt: Date.now(), ...streamPatch(input) })
          .where(refWhere(input))
          .run();
        return { entityId: existing.entityId, action: "unchanged" };
      }
      return updateFromExternal(input, existing.entityId);
    });

  const tombstoneExternal = (
    key: ExternalRefKey,
  ): { entityId: string } | null =>
    withTransaction(() => {
      const ref = findRef(key);
      if (ref === undefined) {
        return null;
      }
      db.update(entities)
        .set({ deletedAt: Date.now() })
        .where(eq(entities.id, ref.entityId))
        .run();
      return { entityId: ref.entityId };
    });

  // Self-wrapped like upsertExternal: atomic alone, and nestable inside
  // a caller transaction that bundles satellite writes with the spine.
  const createUserEntity = (
    input: CreateUserEntityInput,
  ): { entityId: string } => withTransaction(() => insertUserEntity(db, input));

  const updateUserEntity = (id: string, patch: UpdateUserEntityPatch): void =>
    withTransaction(() => applyUserEntityUpdate(db, id, patch));

  const deleteUserEntity = (id: string): void =>
    withTransaction(() => applyUserEntityDelete(db, id));

  const getEntity = (id: string): EntityRow | null =>
    db.select().from(entities).where(eq(entities.id, id)).get() ?? null;

  const resolveAlias = (id: string): string => {
    const alias = db
      .select()
      .from(entityAliases)
      .where(eq(entityAliases.oldId, id))
      .get();
    return alias?.canonicalId ?? id;
  };

  const createLink = (input: CreateLinkInput): LinkRow =>
    withTransaction(() => {
      const existing = db
        .select()
        .from(links)
        .where(
          and(
            eq(links.fromId, input.fromId),
            eq(links.toId, input.toId),
            eq(links.kind, input.kind),
          ),
        )
        .get();
      if (existing !== undefined) {
        return existing;
      }
      const row: LinkRow = {
        id: ulid(),
        fromId: input.fromId,
        toId: input.toId,
        kind: input.kind,
        source: input.source,
        metadata: input.metadata ?? null,
        createdAt: Date.now(),
      };
      db.insert(links).values(row).run();
      return row;
    });

  const deleteLink = (id: string): void => {
    db.delete(links).where(eq(links.id, id)).run();
  };

  const getLinksFor = (entityId: string): LinkRow[] =>
    db
      .select()
      .from(links)
      .where(or(eq(links.fromId, entityId), eq(links.toId, entityId)))
      .all();

  return {
    withTransaction,
    upsertExternal,
    tombstoneExternal,
    createUserEntity,
    updateUserEntity,
    deleteUserEntity,
    getEntity,
    resolveAlias,
    createLink,
    deleteLink,
    getLinksFor,
  };
};
