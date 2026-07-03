-- 0007_calendar_event_notes_url: add notes and url to calendar_events.
-- User-created events (v0.4) need a free-text notes field and a link
-- field (a meeting join link or an external page), and synced Google
-- events backfill the same two columns (notes from the description,
-- url from the hangout link or the event's own page) so user and
-- Google events show the same detail in the UI. Both columns are
-- nullable, so a plain ADD COLUMN suffices; no table rebuild.
-- The migration runner wraps this in a transaction and snapshots the
-- database first, so no explicit BEGIN/COMMIT here.
ALTER TABLE calendar_events ADD COLUMN notes TEXT;
ALTER TABLE calendar_events ADD COLUMN url TEXT;
