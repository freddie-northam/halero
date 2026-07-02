-- 0001_core: the Halero core schema.
-- All timestamps are epoch milliseconds (INTEGER).
-- All IDs are TEXT ULIDs unless noted otherwise.

-- The thin generic spine every cross-cutting feature reads.
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  title TEXT,
  snippet TEXT,
  occurred_start INTEGER,
  occurred_end INTEGER,
  source TEXT NOT NULL CHECK (source IN ('user', 'connector')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX idx_entities_occurred_start
  ON entities (occurred_start)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_entities_kind_occurred_start
  ON entities (kind, occurred_start);

-- Satellite: typed per-kind columns for calendar events.
-- start_date and end_date are date strings, only for all-day events.
CREATE TABLE calendar_events (
  entity_id TEXT PRIMARY KEY REFERENCES entities(id),
  calendar_id TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  location TEXT,
  status TEXT,
  recurring_event_id TEXT,
  original_start_time TEXT,
  raw TEXT
);

-- Cross-module links between entities.
CREATE TABLE links (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES entities(id),
  to_id TEXT NOT NULL REFERENCES entities(id),
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (from_id, to_id, kind)
);

CREATE INDEX idx_links_to_id ON links (to_id);

-- Forwarding addresses left behind when entities are merged.
CREATE TABLE entity_aliases (
  old_id TEXT PRIMARY KEY,
  canonical_id TEXT NOT NULL
);

CREATE INDEX idx_entity_aliases_canonical_id ON entity_aliases (canonical_id);

CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  display_name TEXT,
  config TEXT,
  credentials_enc BLOB,
  status TEXT NOT NULL,
  sync_interval_sec INTEGER NOT NULL DEFAULT 300,
  next_sync_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL
);

-- Identity is keyed to the provider account, not the connection row,
-- so deleting and recreating a connection never orphans entities.
CREATE TABLE external_refs (
  connector_id TEXT NOT NULL,
  account_key TEXT NOT NULL,
  external_id TEXT NOT NULL,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  version TEXT,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (connector_id, account_key, external_id)
);

CREATE INDEX idx_external_refs_entity_id ON external_refs (entity_id);

CREATE TABLE sync_cursors (
  connection_id TEXT NOT NULL,
  stream TEXT NOT NULL,
  cursor TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (connection_id, stream)
);

CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL,
  upserts INTEGER NOT NULL DEFAULT 0,
  deletes INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE INDEX idx_sync_runs_connection_started ON sync_runs (connection_id, started_at);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Full-text search over entity titles and snippets, external content.
-- Soft-deleted entities are kept out of the index so search never
-- surfaces them; the triggers below mirror every entities change.
CREATE VIRTUAL TABLE entities_fts USING fts5(
  title,
  snippet,
  content='entities',
  content_rowid='rowid'
);

CREATE TRIGGER entities_fts_after_insert AFTER INSERT ON entities
BEGIN
  INSERT INTO entities_fts (rowid, title, snippet)
  SELECT new.rowid, new.title, new.snippet
  WHERE new.deleted_at IS NULL;
END;

CREATE TRIGGER entities_fts_after_update AFTER UPDATE ON entities
BEGIN
  INSERT INTO entities_fts (entities_fts, rowid, title, snippet)
  SELECT 'delete', old.rowid, old.title, old.snippet
  WHERE old.deleted_at IS NULL;
  INSERT INTO entities_fts (rowid, title, snippet)
  SELECT new.rowid, new.title, new.snippet
  WHERE new.deleted_at IS NULL;
END;

CREATE TRIGGER entities_fts_after_delete AFTER DELETE ON entities
BEGIN
  INSERT INTO entities_fts (entities_fts, rowid, title, snippet)
  SELECT 'delete', old.rowid, old.title, old.snippet
  WHERE old.deleted_at IS NULL;
END;
