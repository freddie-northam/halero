# Backup, restore, upgrade, rollback

The short version: back up `<data>/backups` and `<data>/key`. Never copy
`halero.db` while the server is running.

`<data>` is the data directory (`HALERO_DATA_DIR`, default `./data`; `/data`
in the Docker image).

## What the backups directory contains

Halero writes two kinds of snapshot into `<data>/backups`, both created with
SQLite's `VACUUM INTO`, so each one is a single consistent database file:

- `halero-YYYY-MM-DD.db`: a daily snapshot, taken at 03:00 server time. The
  newest seven are kept; older ones are rotated away.
- `pre-<migration>-<timestamp>.db`: taken automatically right before a
  version upgrade applies database migrations. These are never rotated; they
  are the rollback points.

## The key file

`<data>/key` holds the 64-character hex key that encrypts connector
credentials (Google OAuth tokens) inside the database. What losing it means:

- Your data survives. Events, entities, links, and settings are stored in
  plain form in the database; the key does not protect them.
- Connector credentials are orphaned. Without the key the stored OAuth
  tokens are unreadable, and you reconnect each connector once (a few
  clicks; the synced data is still there).

The key is deliberately absent from the JSON Lines export, so an export
alone cannot restore connections. Back the file up together with the
backups directory. If you run with the `HALERO_KEY` environment variable
instead, that value is the key and there may be no file; back up wherever
that value lives.

## Never copy the live database

While the server runs, the database is three files: `halero.db`,
`halero.db-wal`, and `halero.db-shm` (SQLite WAL mode). Copying them while
the server writes produces a silently torn copy that may fail to open, or
worse, open and be missing recent data. Do not point Time Machine, rsync,
or any file-level backup tool at the live `halero.db`.

Safe sources, in order of convenience:

1. Files in `<data>/backups`. They are complete, consistent snapshots.
2. `GET /api/export` (open it in the browser while signed in): a redacted
   JSON Lines file for portability. It is generated from a snapshot, never
   from the live file, and contains no credentials and no key.
3. `halero.db` itself, but only after stopping the server.

A backup of the whole data directory taken while the server is stopped is
also fine.

## Restore

You need: a snapshot file (daily or `pre-*`) and the matching `key` file.

1. Stop Halero.
   - launchd: `launchctl bootout gui/$UID/com.halero`
   - Docker: `docker compose -f docker/compose.yaml down`
2. In the data directory, move the old database out of the way (all three
   files if present):
   ```sh
   mv halero.db halero.db.broken 2>/dev/null
   rm -f halero.db-wal halero.db-shm
   ```
3. Copy the chosen snapshot in as the database:
   ```sh
   cp backups/halero-2026-07-01.db halero.db
   ```
   Do not copy any `-wal` or `-shm` files; SQLite recreates them.
4. Make sure `<data>/key` is the key that was in place when the snapshot
   was taken (restore it from your backup if the data directory is new).
   With the wrong key the server still starts and all data is there, but
   every connector needs reconnecting.
5. Start Halero and check `http://<host>:4253/healthz`.

Whatever happened between the snapshot and now is not in the database.
Connector data (calendar events) fills back in on the next sync; local
edits made after the snapshot are gone.

To restore onto a fresh machine: install Halero (see
[self-hosting.md](self-hosting.md)), start it once so the data directory
exists, stop it, then follow the steps above with your backed-up snapshot
and key. For Docker, the data directory is inside the `halero-data` volume;
reach it with `docker run --rm -it -v halero-data:/data --entrypoint /bin/sh
oven/bun:1.3.3-slim` or `docker cp`.

## Upgrade

Upgrades are: get the new code, restart. Concretely:

- launchd: `git pull && bun install --frozen-lockfile && bun run build`,
  then `launchctl kickstart -k gui/$UID/com.halero`
- Docker: `git pull`, then
  `docker compose -f docker/compose.yaml up -d --build`

If the new version carries database migrations, the first start snapshots
the database to `backups/pre-<migration>-<timestamp>.db` before touching
anything. Each migration runs in its own transaction: a failing migration
rolls itself back, stops the ones after it, and the server exits with an
error naming the migration. The database is left as it was at the start of
that migration.

## Rollback

Going back to an older version needs two things, because an older server
refuses to open a newer schema (it exits with an error naming the unknown
migrations and the most recent snapshot):

1. The previous code or image.
2. The `pre-*` snapshot taken by the upgrade you are undoing.

Procedure:

1. Stop Halero.
2. Return the code to the previous version.
   - launchd: `git checkout <previous-commit-or-tag>`, then
     `bun install --frozen-lockfile && bun run build`
   - Docker: check out the previous commit and rebuild, or run the
     previously built image if you still have it
3. Restore the newest `pre-*` snapshot using the restore steps above. Its
   name tells you which migration it was taken before.
4. Start Halero and check `/healthz`.

Anything written after the upgrade is lost with the rollback; synced data
returns on the next sync.
