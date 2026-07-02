-- 0003_external_ref_streams: stream-scoped provenance for external refs.
-- Records which stream of a connection last saw each external item, so
-- the sync engine can scope 410 sweeps and the moved-item delete guard
-- generically instead of peeking into per-kind satellite tables.
-- Backfilled through the entity from calendar_events.calendar_id, the
-- only stream-bearing satellite that exists before this migration; refs
-- without a satellite stay NULL.
-- The migration runner wraps this in a transaction and snapshots the
-- database first, so no explicit BEGIN/COMMIT here.
ALTER TABLE external_refs ADD COLUMN stream TEXT;

UPDATE external_refs SET stream = (
  SELECT calendar_events.calendar_id
  FROM calendar_events
  WHERE calendar_events.entity_id = external_refs.entity_id
);
