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

export interface EntityStore {
  withTransaction<T>(fn: () => T): T;
  upsertExternal(input: UpsertExternalInput): UpsertExternalResult;
  tombstoneExternal(key: ExternalRefKey): { entityId: string } | null;
  getEntity(id: string): EntityRow | null;
  resolveAlias(id: string): string;
  createLink(input: CreateLinkInput): LinkRow;
  deleteLink(id: string): void;
  getLinksFor(entityId: string): LinkRow[];
}

const spineValues = (spine: SpineInput) => ({
  kind: spine.kind,
  schemaVersion: spine.schemaVersion,
  title: spine.title ?? null,
  snippet: spine.snippet ?? null,
  occurredStart: spine.occurredStart ?? null,
  occurredEnd: spine.occurredEnd ?? null,
  source: spine.source,
});

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
      .set({ version: input.version ?? null, lastSeenAt: now })
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
        // items must still refresh it to survive the sweep.
        db.update(externalRefs)
          .set({ lastSeenAt: Date.now() })
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
    getEntity,
    resolveAlias,
    createLink,
    deleteLink,
    getLinksFor,
  };
};
