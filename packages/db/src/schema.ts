import { sql } from "drizzle-orm";
import {
  blob,
  index,
  integer,
  primaryKey,
  real,
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
  // Added by migrations/0008_calendar_event_notes_url.sql.
  notes: text("notes"),
  url: text("url"),
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

// Rebuilt by migrations/0006_tasks_board.sql for the Kanban board.
export const tasks = sqliteTable(
  "tasks",
  {
    entityId: text("entity_id")
      .primaryKey()
      .references(() => entities.id),
    status: text("status", { enum: ["todo", "doing", "done"] })
      .notNull()
      .default("todo"),
    priority: text("priority", { enum: ["high", "medium", "low"] }),
    /** JSON string array, nullable. */
    tags: text("tags"),
    dueDate: text("due_date"),
    completedAt: integer("completed_at"),
    notes: text("notes"),
    estimateMinutes: integer("estimate_minutes"),
    loggedMinutes: integer("logged_minutes").notNull().default(0),
    sortOrder: real("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_tasks_status_due").on(table.status, table.dueDate),
    index("idx_tasks_status_sort").on(table.status, table.sortOrder),
  ],
);

// Added by migrations/0007_notes.sql for the Notes module.
export const notes = sqliteTable("notes", {
  entityId: text("entity_id")
    .primaryKey()
    .references(() => entities.id),
  /** BlockNote block document, stored as a JSON string. */
  document: text("document").notNull(),
  /** JSON string array, nullable. */
  tags: text("tags"),
});

// Added by migrations/0008_activity.sql for the Progress heatmap.
export const activityDaily = sqliteTable(
  "activity_daily",
  {
    source: text("source").notNull(),
    date: text("date").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.date] }),
    index("idx_activity_daily_date").on(t.date),
  ],
);

export const apiTokens = sqliteTable("api_tokens", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
  revokedAt: integer("revoked_at"),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Added by migrations/0009_f1.sql for the F1 module.

// f1.session satellite: one row per F1 session, keyed to the entity spine.
export const f1Sessions = sqliteTable(
  "f1_sessions",
  {
    entityId: text("entity_id")
      .primaryKey()
      .references(() => entities.id),
    sessionKey: integer("session_key").notNull().unique(),
    meetingKey: integer("meeting_key").notNull(),
    sessionName: text("session_name").notNull(),
    sessionType: text("session_type").notNull(),
    year: integer("year").notNull(),
    dateStart: text("date_start"),
    dateEnd: text("date_end"),
    gmtOffset: text("gmt_offset"),
    circuitKey: integer("circuit_key"),
    circuitShortName: text("circuit_short_name"),
    countryName: text("country_name"),
    countryCode: text("country_code"),
    location: text("location"),
    meetingName: text("meeting_name"),
    countryFlagUrl: text("country_flag_url"),
    circuitImageUrl: text("circuit_image_url"),
    circuitInfoUrl: text("circuit_info_url"),
    isCancelled: integer("is_cancelled").notNull().default(0),
    raw: text("raw"),
  },
  (table) => [
    index("idx_f1_sessions_meeting").on(table.meetingKey),
    index("idx_f1_sessions_year_type").on(table.year, table.sessionType),
  ],
);

export const f1Meetings = sqliteTable(
  "f1_meetings",
  {
    meetingKey: integer("meeting_key").primaryKey(),
    year: integer("year").notNull(),
    meetingName: text("meeting_name"),
    meetingOfficialName: text("meeting_official_name"),
    countryName: text("country_name"),
    countryCode: text("country_code"),
    countryFlagUrl: text("country_flag_url"),
    circuitKey: integer("circuit_key"),
    circuitShortName: text("circuit_short_name"),
    circuitImageUrl: text("circuit_image_url"),
    circuitInfoUrl: text("circuit_info_url"),
    location: text("location"),
    gmtOffset: text("gmt_offset"),
    dateStart: text("date_start"),
    dateEnd: text("date_end"),
  },
  (table) => [index("idx_f1_meetings_year").on(table.year)],
);

export const f1Drivers = sqliteTable(
  "f1_drivers",
  {
    sessionKey: integer("session_key").notNull(),
    driverNumber: integer("driver_number").notNull(),
    meetingKey: integer("meeting_key"),
    fullName: text("full_name"),
    broadcastName: text("broadcast_name"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    nameAcronym: text("name_acronym"),
    teamName: text("team_name"),
    teamColour: text("team_colour"),
    headshotUrl: text("headshot_url"),
    countryCode: text("country_code"),
  },
  (table) => [primaryKey({ columns: [table.sessionKey, table.driverNumber] })],
);

export const f1SessionResults = sqliteTable(
  "f1_session_results",
  {
    sessionKey: integer("session_key").notNull(),
    driverNumber: integer("driver_number").notNull(),
    position: integer("position"),
    points: real("points"),
    dnf: integer("dnf").notNull().default(0),
    dns: integer("dns").notNull().default(0),
    dsq: integer("dsq").notNull().default(0),
    duration: real("duration"),
    // number OR "+1 LAP" OR null -> stored as text.
    gapToLeader: text("gap_to_leader"),
    numberOfLaps: integer("number_of_laps"),
  },
  (table) => [primaryKey({ columns: [table.sessionKey, table.driverNumber] })],
);

export const f1StandingsDrivers = sqliteTable(
  "f1_standings_drivers",
  {
    sessionKey: integer("session_key").notNull(),
    driverNumber: integer("driver_number").notNull(),
    positionCurrent: integer("position_current"),
    positionStart: integer("position_start"),
    pointsCurrent: real("points_current"),
    pointsStart: real("points_start"),
  },
  (table) => [primaryKey({ columns: [table.sessionKey, table.driverNumber] })],
);

export const f1StandingsTeams = sqliteTable(
  "f1_standings_teams",
  {
    sessionKey: integer("session_key").notNull(),
    teamName: text("team_name").notNull(),
    positionCurrent: integer("position_current"),
    positionStart: integer("position_start"),
    pointsCurrent: real("points_current"),
    pointsStart: real("points_start"),
  },
  (table) => [primaryKey({ columns: [table.sessionKey, table.teamName] })],
);

export const f1Boards = sqliteTable("f1_boards", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: real("sort_order").notNull().default(0),
  layout: text("layout").notNull().default("[]"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
