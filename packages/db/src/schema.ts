import { sql } from "drizzle-orm";
import {
  blob,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

// Typed handles for the tables created by migrations/0001_core.sql.
// The SQL file is the source of truth; column names here must match it.

export const entities = sqliteTable(
  "entities",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    title: text("title"),
    snippet: text("snippet"),
    occurredStart: integer("occurred_start"),
    occurredEnd: integer("occurred_end"),
    source: text("source", { enum: ["user", "connector"] }).notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("idx_entities_occurred_start")
      .on(table.occurredStart)
      .where(sql`deleted_at IS NULL`),
    index("idx_entities_kind_occurred_start").on(
      table.kind,
      table.occurredStart,
    ),
  ],
);

export const calendarEvents = sqliteTable("calendar_events", {
  entityId: text("entity_id")
    .primaryKey()
    .references(() => entities.id),
  calendarId: text("calendar_id").notNull(),
  allDay: integer("all_day").notNull().default(0),
  startDate: text("start_date"),
  endDate: text("end_date"),
  location: text("location"),
  status: text("status"),
  recurringEventId: text("recurring_event_id"),
  originalStartTime: text("original_start_time"),
  raw: text("raw"),
});

export const links = sqliteTable(
  "links",
  {
    id: text("id").primaryKey(),
    fromId: text("from_id")
      .notNull()
      .references(() => entities.id),
    toId: text("to_id")
      .notNull()
      .references(() => entities.id),
    kind: text("kind").notNull(),
    source: text("source").notNull(),
    metadata: text("metadata"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    unique("links_from_id_to_id_kind_unique").on(
      table.fromId,
      table.toId,
      table.kind,
    ),
    index("idx_links_to_id").on(table.toId),
  ],
);

export const entityAliases = sqliteTable(
  "entity_aliases",
  {
    oldId: text("old_id").primaryKey(),
    canonicalId: text("canonical_id").notNull(),
  },
  (table) => [index("idx_entity_aliases_canonical_id").on(table.canonicalId)],
);

export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(),
  connectorId: text("connector_id").notNull(),
  displayName: text("display_name"),
  config: text("config"),
  credentialsEnc: blob("credentials_enc", { mode: "buffer" }),
  status: text("status").notNull(),
  syncIntervalSec: integer("sync_interval_sec").notNull().default(300),
  nextSyncAt: integer("next_sync_at"),
  // Added by migrations/0002_connection_backoff.sql.
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastError: text("last_error"),
  createdAt: integer("created_at").notNull(),
});

export const externalRefs = sqliteTable(
  "external_refs",
  {
    connectorId: text("connector_id").notNull(),
    accountKey: text("account_key").notNull(),
    externalId: text("external_id").notNull(),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    version: text("version"),
    lastSeenAt: integer("last_seen_at").notNull(),
    // Added by migrations/0003_external_ref_streams.sql: the stream of
    // the connection that last saw this item (e.g. a calendar id).
    stream: text("stream"),
  },
  (table) => [
    primaryKey({
      columns: [table.connectorId, table.accountKey, table.externalId],
    }),
    index("idx_external_refs_entity_id").on(table.entityId),
  ],
);

export const syncCursors = sqliteTable(
  "sync_cursors",
  {
    connectionId: text("connection_id").notNull(),
    stream: text("stream").notNull(),
    cursor: text("cursor").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.stream] })],
);

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
    status: text("status").notNull(),
    upserts: integer("upserts").notNull().default(0),
    deletes: integer("deletes").notNull().default(0),
    error: text("error"),
  },
  (table) => [
    index("idx_sync_runs_connection_started").on(
      table.connectionId,
      table.startedAt,
    ),
  ],
);

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
