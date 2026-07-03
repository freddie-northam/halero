-- 0007_notes: add the notes satellite for the Notes module.
-- A note is a user entity on the spine (entities) whose body is a
-- BlockNote block document. The satellite holds that document and the
-- note's tags; the entity row owns the title, the searchable snippet
-- (extracted plaintext), and every timestamp. entity_id is the 1:1
-- foreign key to entities, matching the other satellites; notes is a
-- leaf table that nothing else references.
-- The migration runner wraps this in a transaction and snapshots the
-- database first, so no explicit BEGIN/COMMIT here.
CREATE TABLE notes (
  entity_id TEXT PRIMARY KEY REFERENCES entities(id),
  document TEXT NOT NULL,
  tags TEXT
);
