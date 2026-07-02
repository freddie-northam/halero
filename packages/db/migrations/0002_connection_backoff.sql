-- 0002_connection_backoff: failure tracking for the sync scheduler.
-- Counts consecutive failed runs per connection; the scheduler uses it
-- to back off retries. Reset to 0 on success and on reconnect.
-- The migration runner wraps this in a transaction and snapshots the
-- database first, so no explicit BEGIN/COMMIT here.
ALTER TABLE connections ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
