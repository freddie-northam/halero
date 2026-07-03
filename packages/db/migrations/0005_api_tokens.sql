-- 0005_api_tokens: personal API tokens for non-browser clients.
-- Only the SHA-256 hex of the whole token string is stored; the
-- plaintext exists once, in the mint response. revoked_at is a
-- tombstone so a revoked token stays visible in Settings, and the
-- UNIQUE hash makes the bearer lookup a single indexed read.
-- last_used_at writes are throttled by the server (SD-card churn).
-- The migration runner wraps this in a transaction and snapshots the
-- database first, so no explicit BEGIN/COMMIT here.
CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
