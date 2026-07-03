-- 0004_tasks: satellite table for the Tasks module.
-- One row per task entity, keyed by entity_id like every other
-- satellite. status defaults to 'open'; completed_at is set by the
-- Tasks module when a task moves to 'done', not enforced here.
-- The migration runner wraps this in a transaction and snapshots the
-- database first, so no explicit BEGIN/COMMIT here.
CREATE TABLE tasks (
  entity_id TEXT PRIMARY KEY REFERENCES entities(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  due_date TEXT,
  completed_at INTEGER,
  notes TEXT
);

CREATE INDEX idx_tasks_status_due ON tasks (status, due_date);
