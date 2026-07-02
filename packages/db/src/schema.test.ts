import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "./migration-runner";
import { coreMigrations } from "./migrations";
import { type HaleroDatabase, openDatabase } from "./open-database";
import { calendarEvents, entities, links } from "./schema";

const openMigrated = (): HaleroDatabase => {
  const dir = mkdtempSync(join(tmpdir(), "halero-db-"));
  const handle = openDatabase(join(dir, "halero.db"));
  runMigrations(handle.sqlite, {
    migrations: coreMigrations,
    backupsDir: join(dir, "backups"),
  });
  return handle;
};

const insertEntity = (handle: HaleroDatabase, id: string): void => {
  handle.sqlite.run(
    `INSERT INTO entities (id, kind, schema_version, source, created_at, updated_at)
     VALUES (?, 'note', 1, 'user', 1, 1)`,
    [id],
  );
};

describe("core schema", () => {
  test("entities has a partial index on occurred_start for live rows", () => {
    const { sqlite } = openMigrated();

    const row = sqlite
      .query<{ sql: string }, [string]>(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
      )
      .get("idx_entities_occurred_start");

    expect(row?.sql).toContain("occurred_start");
    expect(row?.sql).toContain("WHERE deleted_at IS NULL");
    sqlite.close();
  });

  test("entities has a (kind, occurred_start) index", () => {
    const { sqlite } = openMigrated();

    const row = sqlite
      .query<{ sql: string }, [string]>(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
      )
      .get("idx_entities_kind_occurred_start");

    expect(row?.sql).toContain("kind, occurred_start");
    sqlite.close();
  });

  test("links enforces UNIQUE (from_id, to_id, kind)", () => {
    const handle = openMigrated();
    insertEntity(handle, "e1");
    insertEntity(handle, "e2");
    const insertLink = (id: string): void => {
      handle.sqlite.run(
        `INSERT INTO links (id, from_id, to_id, kind, source, created_at)
         VALUES (?, 'e1', 'e2', 'mentions', 'user', 1)`,
        [id],
      );
    };
    insertLink("l1");

    expect(() => insertLink("l2")).toThrow(/UNIQUE/);
    handle.sqlite.close();
  });

  test("entities rejects a source outside ('user', 'connector')", () => {
    const { sqlite } = openMigrated();

    expect(() =>
      sqlite.run(
        `INSERT INTO entities (id, kind, schema_version, source, created_at, updated_at)
         VALUES ('e1', 'note', 1, 'martian', 1, 1)`,
      ),
    ).toThrow(/CHECK/);
    sqlite.close();
  });

  test("external_refs enforces its composite primary key", () => {
    const handle = openMigrated();
    insertEntity(handle, "e1");
    const insertRef = (): void => {
      handle.sqlite.run(
        `INSERT INTO external_refs (connector_id, account_key, external_id, entity_id, last_seen_at)
         VALUES ('gcal', 'acct@example.com', 'ext-1', 'e1', 1)`,
      );
    };
    insertRef();

    expect(insertRef).toThrow(/UNIQUE|PRIMARY/);
    handle.sqlite.close();
  });

  test("calendar_events enforces the foreign key to entities", () => {
    const { sqlite } = openMigrated();

    expect(() =>
      sqlite.run(
        "INSERT INTO calendar_events (entity_id, calendar_id) VALUES ('missing', 'primary')",
      ),
    ).toThrow(/FOREIGN KEY/);
    sqlite.close();
  });

  test("Drizzle definitions round-trip against the migrated schema", () => {
    const { sqlite, db } = openMigrated();

    db.insert(entities)
      .values({
        id: "e1",
        kind: "calendar.event",
        schemaVersion: 1,
        title: "Standup",
        source: "connector",
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(entities)
      .values({
        id: "e2",
        kind: "note",
        schemaVersion: 1,
        source: "user",
        createdAt: 2,
        updatedAt: 2,
      })
      .run();
    db.insert(calendarEvents)
      .values({
        entityId: "e1",
        calendarId: "primary",
        allDay: 1,
        startDate: "2026-07-02",
      })
      .run();
    db.insert(links)
      .values({
        id: "l1",
        fromId: "e2",
        toId: "e1",
        kind: "mentions",
        source: "user",
        createdAt: 3,
      })
      .run();

    const entity = db.select().from(entities).all();
    const event = db.select().from(calendarEvents).get();
    const link = db.select().from(links).get();

    expect(entity).toHaveLength(2);
    expect(event?.calendarId).toBe("primary");
    expect(event?.allDay).toBe(1);
    expect(link?.fromId).toBe("e2");
    sqlite.close();
  });
});
