-- 0010_f1: the F1 module's tables. Two kinds of data:
--
--   * f1_sessions is a SATELLITE of the entity spine (keyed by entity_id):
--     one row per F1 session, produced by the OpenF1 connector so sessions
--     show up in universal search and on Today/Calendar like any entity.
--
--   * the remaining f1_* tables are module-owned DETAIL, keyed by OpenF1's
--     own keys (session_key, driver_number, ...). They are NOT on the spine
--     (too granular to be individual timeline items); the module fills and
--     caches them and reads them straight back for its widgets. Historical
--     F1 data is immutable once a session ends, so these double as a durable
--     local archive.
--
--   * f1_boards holds the user's customizable widget dashboards (layout JSON).

CREATE TABLE f1_sessions (
  entity_id         TEXT PRIMARY KEY REFERENCES entities (id),
  session_key       INTEGER NOT NULL UNIQUE,
  meeting_key       INTEGER NOT NULL,
  session_name      TEXT NOT NULL,
  session_type      TEXT NOT NULL,
  year              INTEGER NOT NULL,
  date_start        TEXT,
  date_end          TEXT,
  gmt_offset        TEXT,
  circuit_key       INTEGER,
  circuit_short_name TEXT,
  country_name      TEXT,
  country_code      TEXT,
  location          TEXT,
  meeting_name      TEXT,
  country_flag_url  TEXT,
  circuit_image_url TEXT,
  circuit_info_url  TEXT,
  is_cancelled      INTEGER NOT NULL DEFAULT 0,
  raw               TEXT
);
CREATE INDEX idx_f1_sessions_meeting ON f1_sessions (meeting_key);
CREATE INDEX idx_f1_sessions_year_type ON f1_sessions (year, session_type);

-- Meeting (race weekend) metadata, keyed by OpenF1 meeting_key.
CREATE TABLE f1_meetings (
  meeting_key        INTEGER PRIMARY KEY,
  year               INTEGER NOT NULL,
  meeting_name       TEXT,
  meeting_official_name TEXT,
  country_name       TEXT,
  country_code       TEXT,
  country_flag_url   TEXT,
  circuit_key        INTEGER,
  circuit_short_name TEXT,
  circuit_image_url  TEXT,
  circuit_info_url   TEXT,
  location           TEXT,
  gmt_offset         TEXT,
  date_start         TEXT,
  date_end           TEXT
);
CREATE INDEX idx_f1_meetings_year ON f1_meetings (year);

-- Driver entry list per session, keyed by (session_key, driver_number).
CREATE TABLE f1_drivers (
  session_key    INTEGER NOT NULL,
  driver_number  INTEGER NOT NULL,
  meeting_key    INTEGER,
  full_name      TEXT,
  broadcast_name TEXT,
  first_name     TEXT,
  last_name      TEXT,
  name_acronym   TEXT,
  team_name      TEXT,
  team_colour    TEXT,
  headshot_url   TEXT,
  country_code   TEXT,
  PRIMARY KEY (session_key, driver_number)
);

-- Classification per session, keyed by (session_key, driver_number).
-- gap_to_leader is TEXT because OpenF1 returns a number OR a string
-- ("+1 LAP") OR null; position is nullable (DNF); duration nullable.
CREATE TABLE f1_session_results (
  session_key    INTEGER NOT NULL,
  driver_number  INTEGER NOT NULL,
  position       INTEGER,
  points         REAL,
  dnf            INTEGER NOT NULL DEFAULT 0,
  dns            INTEGER NOT NULL DEFAULT 0,
  dsq            INTEGER NOT NULL DEFAULT 0,
  duration       REAL,
  gap_to_leader  TEXT,
  number_of_laps INTEGER,
  PRIMARY KEY (session_key, driver_number)
);

-- Championship standings snapshot after a session (from championship_*).
CREATE TABLE f1_standings_drivers (
  session_key     INTEGER NOT NULL,
  driver_number   INTEGER NOT NULL,
  position_current INTEGER,
  position_start  INTEGER,
  points_current  REAL,
  points_start    REAL,
  PRIMARY KEY (session_key, driver_number)
);

CREATE TABLE f1_standings_teams (
  session_key     INTEGER NOT NULL,
  team_name       TEXT NOT NULL,
  position_current INTEGER,
  position_start  INTEGER,
  points_current  REAL,
  points_start    REAL,
  PRIMARY KEY (session_key, team_name)
);

-- Customizable widget dashboards. layout is a JSON array of widget
-- instances ({ instanceId, type, size, config }). Single-user, so no owner.
CREATE TABLE f1_boards (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order REAL NOT NULL DEFAULT 0,
  layout     TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
