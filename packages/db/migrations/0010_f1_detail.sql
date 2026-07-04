-- 0010_f1_detail: the F1 module's race-explorer detail tables. All
-- module-owned (not on the entity spine), keyed by OpenF1's own keys, and
-- filled fetch-on-view then cached: historical race data is immutable once
-- a session ends, so these rows are a permanent local archive. All of this
-- data is free on OpenF1 (the paid tier gates only real-time access).

CREATE TABLE f1_laps (
  session_key   INTEGER NOT NULL,
  driver_number INTEGER NOT NULL,
  lap_number    INTEGER NOT NULL,
  date_start    TEXT,
  lap_duration  REAL,
  duration_sector_1 REAL,
  duration_sector_2 REAL,
  duration_sector_3 REAL,
  i1_speed      INTEGER,
  i2_speed      INTEGER,
  st_speed      INTEGER,
  is_pit_out_lap INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_key, driver_number, lap_number)
);

CREATE TABLE f1_stints (
  session_key       INTEGER NOT NULL,
  driver_number     INTEGER NOT NULL,
  stint_number      INTEGER NOT NULL,
  lap_start         INTEGER,
  lap_end           INTEGER,
  compound          TEXT,
  tyre_age_at_start INTEGER,
  PRIMARY KEY (session_key, driver_number, stint_number)
);

CREATE TABLE f1_pits (
  session_key   INTEGER NOT NULL,
  driver_number INTEGER NOT NULL,
  lap_number    INTEGER NOT NULL,
  date          TEXT,
  lane_duration REAL,
  stop_duration REAL,
  PRIMARY KEY (session_key, driver_number, lap_number)
);

-- Position time series: one row per (driver, timestamp).
CREATE TABLE f1_positions (
  session_key   INTEGER NOT NULL,
  driver_number INTEGER NOT NULL,
  date          TEXT NOT NULL,
  position      INTEGER,
  PRIMARY KEY (session_key, driver_number, date)
);

CREATE TABLE f1_race_control (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key   INTEGER NOT NULL,
  date          TEXT,
  lap_number    INTEGER,
  category      TEXT,
  flag          TEXT,
  scope         TEXT,
  sector        INTEGER,
  driver_number INTEGER,
  message       TEXT
);
CREATE INDEX idx_f1_race_control_session ON f1_race_control (session_key);

CREATE TABLE f1_team_radio (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key   INTEGER NOT NULL,
  driver_number INTEGER,
  date          TEXT,
  recording_url TEXT
);
CREATE INDEX idx_f1_team_radio_session ON f1_team_radio (session_key);

CREATE TABLE f1_overtakes (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key              INTEGER NOT NULL,
  date                     TEXT,
  position                 INTEGER,
  overtaking_driver_number INTEGER,
  overtaken_driver_number  INTEGER
);
CREATE INDEX idx_f1_overtakes_session ON f1_overtakes (session_key);

CREATE TABLE f1_weather (
  session_key      INTEGER NOT NULL,
  date             TEXT NOT NULL,
  air_temperature  REAL,
  track_temperature REAL,
  humidity         REAL,
  pressure         REAL,
  rainfall         REAL,
  wind_speed       REAL,
  wind_direction   INTEGER,
  PRIMARY KEY (session_key, date)
);
