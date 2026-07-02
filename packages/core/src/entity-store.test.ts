import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  calendarEvents,
  coreMigrations,
  entityAliases,
  externalRefs,
  type HaleroDatabase,
  openDatabase,
  runMigrations,
} from "@halero/db";
import { eq } from "drizzle-orm";
import {
  createEntityStore,
  type EntityStore,
  type UpsertExternalInput,
} from "./entity-store";

const openMigrated = (): HaleroDatabase => {
  const dir = mkdtempSync(join(tmpdir(), "halero-core-"));
  const handle = openDatabase(join(dir, "halero.db"));
  runMigrations(handle.sqlite, {
    migrations: coreMigrations,
    backupsDir: join(dir, "backups"),
  });
  return handle;
};

const makeStore = (): { handle: HaleroDatabase; store: EntityStore } => {
  const handle = openMigrated();
  return { handle, store: createEntityStore(handle) };
};

const eventInput = (
  overrides: Partial<UpsertExternalInput> = {},
): UpsertExternalInput => ({
  connectorId: "google-calendar",
  accountKey: "user@example.com",
  externalId: "evt-1",
  version: "v1",
  spine: {
    kind: "calendar_event",
    schemaVersion: 1,
    title: "Quarterly planning",
    snippet: "budget review",
    occurredStart: 1_000,
    occurredEnd: 2_000,
    source: "connector",
  },
  ...overrides,
});

describe("upsertExternal", () => {
  test("creates an entity and ref on first sight", () => {
    const { store } = makeStore();

    const result = store.upsertExternal(eventInput());

    expect(result.action).toBe("created");
    const entity = store.getEntity(result.entityId);
    expect(entity?.title).toBe("Quarterly planning");
    expect(entity?.kind).toBe("calendar_event");
    expect(entity?.deletedAt).toBeNull();
  });

  test("equal non-null version leaves updated_at untouched but bumps last_seen_at", () => {
    const { handle, store } = makeStore();
    const { entityId } = store.upsertExternal(eventInput());
    handle.sqlite.run("UPDATE entities SET updated_at = 111 WHERE id = ?", [
      entityId,
    ]);
    handle.sqlite.run(
      "UPDATE external_refs SET last_seen_at = 222 WHERE entity_id = ?",
      [entityId],
    );

    const result = store.upsertExternal(eventInput());

    expect(result).toEqual({ entityId, action: "unchanged" });
    expect(store.getEntity(entityId)?.updatedAt).toBe(111);
    const ref = handle.db
      .select()
      .from(externalRefs)
      .where(eq(externalRefs.entityId, entityId))
      .get();
    expect(ref?.lastSeenAt).toBeGreaterThan(222);
    expect(ref?.version).toBe("v1");
  });

  test("a new version updates spine fields, updated_at, and the ref", () => {
    const { handle, store } = makeStore();
    const { entityId } = store.upsertExternal(eventInput());
    handle.sqlite.run("UPDATE entities SET updated_at = 111 WHERE id = ?", [
      entityId,
    ]);

    const updated = eventInput({ version: "v2" });
    const result = store.upsertExternal({
      ...updated,
      spine: { ...updated.spine, title: "Annual retrospective" },
    });

    expect(result).toEqual({ entityId, action: "updated" });
    const entity = store.getEntity(entityId);
    expect(entity?.title).toBe("Annual retrospective");
    expect(entity?.updatedAt).toBeGreaterThan(111);
    const ref = handle.db
      .select()
      .from(externalRefs)
      .where(eq(externalRefs.entityId, entityId))
      .get();
    expect(ref?.version).toBe("v2");
  });

  test("a missing version always updates", () => {
    const { store } = makeStore();
    const { entityId } = store.upsertExternal(eventInput({ version: null }));

    const result = store.upsertExternal(eventInput({ version: null }));

    expect(result).toEqual({ entityId, action: "updated" });
  });

  test("an upsert resurrects a tombstoned entity", () => {
    const { store } = makeStore();
    const { entityId } = store.upsertExternal(eventInput());
    store.tombstoneExternal(eventInput());
    expect(store.getEntity(entityId)?.deletedAt).not.toBeNull();

    const result = store.upsertExternal(eventInput({ version: "v2" }));

    expect(result).toEqual({ entityId, action: "updated" });
    expect(store.getEntity(entityId)?.deletedAt).toBeNull();
  });

  test("the same provenance through a recreated connection maps to the same entity", () => {
    const { handle, store } = makeStore();
    const viaFirstConnection = store.upsertExternal(eventInput());

    // A deleted and recreated connection changes nothing in the key:
    // identity is (connector_id, account_key, external_id).
    const viaSecondConnection = store.upsertExternal(
      eventInput({ version: "v2" }),
    );

    expect(viaSecondConnection.entityId).toBe(viaFirstConnection.entityId);
    const total = handle.sqlite
      .query<{ total: number }, []>("SELECT count(*) AS total FROM entities")
      .get();
    expect(total?.total).toBe(1);
  });

  test("FTS reflects title updates made through the store", () => {
    const { handle, store } = makeStore();
    store.upsertExternal(eventInput());

    const updated = eventInput({ version: "v2" });
    const { entityId } = store.upsertExternal({
      ...updated,
      spine: { ...updated.spine, title: "Annual retrospective" },
    });

    const match = handle.sqlite
      .query<{ id: string }, [string]>(
        `SELECT id FROM entities
         WHERE rowid IN (SELECT rowid FROM entities_fts WHERE entities_fts MATCH ?)`,
      )
      .get("retrospective");
    expect(match?.id).toBe(entityId);
  });
});

describe("upsertExternal stream provenance", () => {
  const refRow = (handle: HaleroDatabase, entityId: string) =>
    handle.db
      .select()
      .from(externalRefs)
      .where(eq(externalRefs.entityId, entityId))
      .get();

  test("stores the stream on create and null when omitted", () => {
    const { handle, store } = makeStore();

    const withStream = store.upsertExternal(eventInput({ stream: "work" }));
    const withoutStream = store.upsertExternal(
      eventInput({ externalId: "evt-2" }),
    );

    expect(refRow(handle, withStream.entityId)?.stream).toBe("work");
    expect(refRow(handle, withoutStream.entityId)?.stream).toBeNull();
  });

  test("a changed version moves the ref to the new stream", () => {
    const { handle, store } = makeStore();
    const { entityId } = store.upsertExternal(eventInput({ stream: "work" }));

    store.upsertExternal(eventInput({ version: "v2", stream: "personal" }));

    expect(refRow(handle, entityId)?.stream).toBe("personal");
  });

  test("omitting the stream preserves the ref's existing one", () => {
    const { handle, store } = makeStore();
    const { entityId } = store.upsertExternal(eventInput({ stream: "work" }));

    // A caller that does not know about streams must not be able to
    // strip provenance: only an explicit stream (including null) wins.
    store.upsertExternal(eventInput({ version: "v2" }));
    expect(refRow(handle, entityId)?.stream).toBe("work");

    store.upsertExternal(eventInput({ version: "v2" }));
    expect(refRow(handle, entityId)?.stream).toBe("work");

    store.upsertExternal(eventInput({ version: "v3", stream: null }));
    expect(refRow(handle, entityId)?.stream).toBeNull();
  });

  test("a version-equal upsert still moves the ref to the new stream", () => {
    const { handle, store } = makeStore();
    const { entityId } = store.upsertExternal(eventInput({ stream: "work" }));

    // An event moved between calendars can arrive version-equal from the
    // new stream; the stream must still follow it so a stale delete from
    // the old stream cannot tombstone it.
    const result = store.upsertExternal(eventInput({ stream: "personal" }));

    expect(result.action).toBe("unchanged");
    expect(refRow(handle, entityId)?.stream).toBe("personal");
  });
});

describe("tombstoneExternal", () => {
  test("sets deleted_at and keeps the ref row", () => {
    const { handle, store } = makeStore();
    const { entityId } = store.upsertExternal(eventInput());

    const result = store.tombstoneExternal(eventInput());

    expect(result).toEqual({ entityId });
    expect(store.getEntity(entityId)?.deletedAt).not.toBeNull();
    const ref = handle.db
      .select()
      .from(externalRefs)
      .where(eq(externalRefs.entityId, entityId))
      .get();
    expect(ref).toBeDefined();
  });

  test("returns null for an unknown ref", () => {
    const { store } = makeStore();

    expect(store.tombstoneExternal(eventInput())).toBeNull();
  });
});

describe("getEntity and resolveAlias", () => {
  test("getEntity returns null for a missing id", () => {
    const { store } = makeStore();

    expect(store.getEntity("nope")).toBeNull();
  });

  test("resolveAlias follows one hop and defaults to self", () => {
    const { handle, store } = makeStore();
    const { entityId } = store.upsertExternal(eventInput());
    handle.db
      .insert(entityAliases)
      .values({ oldId: "old-id", canonicalId: entityId })
      .run();

    expect(store.resolveAlias("old-id")).toBe(entityId);
    expect(store.resolveAlias(entityId)).toBe(entityId);
  });
});

describe("links", () => {
  test("createLink is idempotent on (from, to, kind)", () => {
    const { store } = makeStore();
    const a = store.upsertExternal(eventInput()).entityId;
    const b = store.upsertExternal(
      eventInput({ externalId: "evt-2" }),
    ).entityId;

    const first = store.createLink({
      fromId: a,
      toId: b,
      kind: "relates_to",
      source: "user",
    });
    const second = store.createLink({
      fromId: a,
      toId: b,
      kind: "relates_to",
      source: "user",
    });

    expect(second.id).toBe(first.id);
    expect(store.getLinksFor(a)).toHaveLength(1);
  });

  test("getLinksFor returns links in both directions", () => {
    const { store } = makeStore();
    const a = store.upsertExternal(eventInput()).entityId;
    const b = store.upsertExternal(
      eventInput({ externalId: "evt-2" }),
    ).entityId;
    const c = store.upsertExternal(
      eventInput({ externalId: "evt-3" }),
    ).entityId;
    store.createLink({
      fromId: a,
      toId: b,
      kind: "relates_to",
      source: "user",
    });
    store.createLink({
      fromId: c,
      toId: a,
      kind: "relates_to",
      source: "user",
    });

    const linksForA = store.getLinksFor(a);

    expect(linksForA).toHaveLength(2);
    expect(store.getLinksFor(b)).toHaveLength(1);
  });

  test("deleteLink removes the link", () => {
    const { store } = makeStore();
    const a = store.upsertExternal(eventInput()).entityId;
    const b = store.upsertExternal(
      eventInput({ externalId: "evt-2" }),
    ).entityId;
    const link = store.createLink({
      fromId: a,
      toId: b,
      kind: "relates_to",
      source: "user",
    });

    store.deleteLink(link.id);

    expect(store.getLinksFor(a)).toHaveLength(0);
  });
});

describe("withTransaction", () => {
  test("rolls back spine and caller-side satellite writes together", () => {
    const { handle, store } = makeStore();

    expect(() =>
      store.withTransaction(() => {
        const { entityId } = store.upsertExternal(eventInput());
        handle.db
          .insert(calendarEvents)
          .values({ entityId, calendarId: "primary" })
          .run();
        throw new Error("sync failed midway");
      }),
    ).toThrow("sync failed midway");

    const entities = handle.sqlite
      .query<{ total: number }, []>("SELECT count(*) AS total FROM entities")
      .get();
    const satellites = handle.sqlite
      .query<{ total: number }, []>(
        "SELECT count(*) AS total FROM calendar_events",
      )
      .get();
    expect(entities?.total).toBe(0);
    expect(satellites?.total).toBe(0);
  });

  test("commits spine and satellite writes together on success", () => {
    const { handle, store } = makeStore();

    const entityId = store.withTransaction(() => {
      const result = store.upsertExternal(eventInput());
      handle.db
        .insert(calendarEvents)
        .values({ entityId: result.entityId, calendarId: "primary" })
        .run();
      return result.entityId;
    });

    const satellite = handle.db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.entityId, entityId))
      .get();
    expect(satellite?.calendarId).toBe("primary");
  });
});
