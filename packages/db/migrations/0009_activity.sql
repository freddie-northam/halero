-- 0008_activity: per-source daily activity counts for the Progress
-- heatmap. Standalone time series, deliberately NOT on the entity spine:
-- these are aggregate daily rollups, not searchable user entities. The
-- composite PK (source, date) makes refresh an idempotent upsert.
CREATE TABLE activity_daily (
  source     TEXT NOT NULL,
  date       TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (source, date)
);
CREATE INDEX idx_activity_daily_date ON activity_daily (date);
