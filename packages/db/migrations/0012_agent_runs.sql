-- 0012_agent_runs: the agent.run satellite. Each Developer-page agent run
-- already lives on the entity spine (kind 'agent.run', added in code); this
-- table holds its durable, kind-specific fields so a run's outcome survives
-- a restart. The full diff patch and live terminal output are transient
-- (they need the worktree / PTY), so only summary stats persist here.
-- entity_id is the primary key and foreign-keys the spine; run_id is the
-- manager's in-memory run id, indexed so a live run can find its row.
-- The migration runner wraps this in a transaction and snapshots first, so
-- no explicit BEGIN/COMMIT here.
CREATE TABLE agent_runs (
  entity_id TEXT PRIMARY KEY REFERENCES entities(id),
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  branch TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  exit_code INTEGER,
  files INTEGER,
  insertions INTEGER,
  deletions INTEGER,
  created_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE INDEX idx_agent_runs_run_id ON agent_runs(run_id);
CREATE INDEX idx_agent_runs_created_at ON agent_runs(created_at);
