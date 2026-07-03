-- 0006_tasks_board: reshape the tasks satellite for the Kanban board.
-- The status CHECK moves to ('todo', 'doing', 'done') and the board
-- columns (priority, tags, estimate/logged time, sort_order) arrive.
-- SQLite cannot alter a CHECK in place, so the table is rebuilt:
-- create tasks_new, copy every row remapping legacy 'open' to 'todo'
-- ('done' stays 'done'), drop the old table, rename. Every copied row
-- keeps its entity_id, so the foreign key to entities holds throughout
-- (tasks is a leaf child table; nothing references it).
-- sort_order is seeded from rowid so existing tasks keep a stable,
-- insertion-ordered position within their column.
-- The migration runner wraps this in a transaction and snapshots the
-- database first, so no explicit BEGIN/COMMIT here.
CREATE TABLE tasks_new (
  entity_id TEXT PRIMARY KEY REFERENCES entities(id),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  priority TEXT CHECK (priority IN ('high', 'medium', 'low')),
  tags TEXT,
  due_date TEXT,
  completed_at INTEGER,
  notes TEXT,
  estimate_minutes INTEGER,
  logged_minutes INTEGER NOT NULL DEFAULT 0,
  sort_order REAL NOT NULL DEFAULT 0
);

INSERT INTO tasks_new (entity_id, status, due_date, completed_at, notes, sort_order)
SELECT
  entity_id,
  CASE status WHEN 'done' THEN 'done' ELSE 'todo' END,
  due_date,
  completed_at,
  notes,
  rowid
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX idx_tasks_status_due ON tasks (status, due_date);
CREATE INDEX idx_tasks_status_sort ON tasks (status, sort_order);
