import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encryptCredentials } from "@halero/core";
import {
  calendarEvents,
  connections,
  entities,
  entityAliases,
  externalRefs,
  links,
  syncCursors,
  syncRuns,
} from "@halero/db";
import { createApiToken, mintApiTokenValue } from "./api-tokens";
import { setSetting } from "./settings";
import { saveGoogleClient } from "./sync/client-config";
import { createOauthState } from "./sync/oauth-state";
import { completeSetup, makeTestApp, type TestApp } from "./test-utils";

const CLIENT_SECRET = "GOCSPX-super-secret-value";
const REFRESH_TOKEN = "1//refresh-token-secret";
const NOTIFY_URL = "https://ntfy.sh/very-secret-topic";

interface ExportLine {
  readonly table: string;
  readonly row: Record<string, unknown>;
}

/** Seeds one row into every exportable table plus the secret stores. */
const seedFullDatabase = (testApp: TestApp): void => {
  const { database, key, clock } = testApp;
  const db = database.db;
  const { sqlite } = database;
  saveGoogleClient(db, key, {
    clientId: "1234-abc.apps.googleusercontent.com",
    clientSecret: CLIENT_SECRET,
  });
  createOauthState(db, clock.value);
  setSetting(db, "base_url", "https://halero.example.com");
  setSetting(db, "notify_url", NOTIFY_URL);
  db.insert(entities)
    .values({
      id: "ent-1",
      kind: "calendar_event",
      schemaVersion: 1,
      title: "Standup",
      source: "connector",
      createdAt: clock.value,
      updatedAt: clock.value,
    })
    .run();
  db.insert(entities)
    .values({
      id: "ent-2",
      kind: "note",
      schemaVersion: 1,
      title: "A note",
      source: "user",
      createdAt: clock.value,
      updatedAt: clock.value,
    })
    .run();
  db.insert(calendarEvents)
    .values({ entityId: "ent-1", calendarId: "primary" })
    .run();
  // Raw insert: the Tasks module doesn't exist yet, this is storage
  // only, so seed its satellite table directly through SQL.
  sqlite.run(
    `INSERT INTO entities (id, kind, schema_version, source, created_at, updated_at)
     VALUES ('ent-3', 'task', 1, 'user', ?, ?)`,
    [clock.value, clock.value],
  );
  sqlite.run(
    "INSERT INTO tasks (entity_id, status, due_date, notes) VALUES ('ent-3', 'open', '2026-07-10', 'Renew passport')",
  );
  db.insert(links)
    .values({
      id: "link-1",
      fromId: "ent-1",
      toId: "ent-2",
      kind: "mentions",
      source: "user",
      createdAt: clock.value,
    })
    .run();
  db.insert(entityAliases)
    .values({ oldId: "ent-old", canonicalId: "ent-1" })
    .run();
  db.insert(connections)
    .values({
      id: "conn-1",
      connectorId: "google-calendar",
      displayName: "Google Calendar",
      config: JSON.stringify({
        email: "person@example.com",
        accountKey: "google-sub-1",
      }),
      credentialsEnc: Buffer.from(
        encryptCredentials(
          key,
          JSON.stringify({
            refreshToken: REFRESH_TOKEN,
            accessToken: "ya29.valid",
            accessTokenExpiresAt: clock.value + 3_600_000,
          }),
        ),
      ),
      status: "active",
      createdAt: clock.value,
    })
    .run();
  db.insert(externalRefs)
    .values({
      connectorId: "google-calendar",
      accountKey: "google-sub-1",
      externalId: "evt-1",
      entityId: "ent-1",
      lastSeenAt: clock.value,
    })
    .run();
  db.insert(syncCursors)
    .values({
      connectionId: "conn-1",
      stream: "primary",
      cursor: "sync-token-1",
      updatedAt: clock.value,
    })
    .run();
  db.insert(syncRuns)
    .values({
      id: "run-1",
      connectionId: "conn-1",
      startedAt: clock.value,
      finishedAt: clock.value + 1_000,
      status: "success",
    })
    .run();
};

const fetchExport = (
  app: TestApp["app"],
  cookie?: string,
): Promise<Response> => {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) {
    headers.cookie = cookie;
  }
  return Promise.resolve(
    app.fetch(new Request("http://localhost/api/export", { headers })),
  );
};

const parseLines = (body: string): ExportLine[] =>
  body
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as ExportLine);

describe("GET /api/export auth", () => {
  test("rejects without a session and leaks nothing", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);

    const res = await fetchExport(app);

    expect(res.status).toBe(401);
    expect(await res.text()).toContain("sign in");
  });
});

describe("GET /api/export redaction", () => {
  test("no secret byte reaches the exported stream", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedFullDatabase(testApp);
    const apiTokenValue = mintApiTokenValue();
    createApiToken(
      testApp.database.db,
      "Raycast",
      apiTokenValue,
      testApp.clock.value,
    );
    const readSetting = (settingKey: string): string =>
      testApp.database.sqlite
        .query<{ value: string }, [string]>(
          "SELECT value FROM settings WHERE key = ?",
        )
        .get(settingKey)?.value ?? "IMPOSSIBLE";
    const storedSecretEnc = readSetting("google_oauth_client_secret_enc");
    const passwordHash = readSetting("password_hash");
    expect(passwordHash).toStartWith("$argon2id$");
    // Presence guard, mirroring the argon2id check above: if the setting
    // ever went missing, the not-contains assertion below would pass
    // vacuously against the "IMPOSSIBLE" fallback.
    expect(storedSecretEnc).toMatch(/^[A-Za-z0-9+/]{30,}={0,2}$/);
    const apiTokenHash =
      testApp.database.sqlite
        .query<{ token_hash: string }, []>("SELECT token_hash FROM api_tokens")
        .get()?.token_hash ?? "IMPOSSIBLE";
    expect(apiTokenHash).toMatch(/^[0-9a-f]{64}$/);

    const res = await fetchExport(testApp.app, cookie);
    const body = await res.text();

    expect(res.status).toBe(200);
    // Raw-bytes assertions: not the plaintext secrets, not the encrypted
    // blobs, not the password hash, not the notification target, not the
    // session token, nowhere in the whole file.
    expect(body).not.toContain(CLIENT_SECRET);
    expect(body).not.toContain(REFRESH_TOKEN);
    expect(body).not.toContain(storedSecretEnc);
    expect(body).not.toContain(passwordHash);
    expect(body).not.toContain(NOTIFY_URL);
    const sessionToken = cookie.replace("halero_session=", "");
    expect(sessionToken.length).toBeGreaterThan(10);
    expect(body).not.toContain(sessionToken);
    // API tokens: not the plaintext, not even the stored hash.
    expect(body).not.toContain(apiTokenValue);
    expect(body).not.toContain(apiTokenHash);

    const lines = parseLines(body);
    // The sessions and api_tokens tables are excluded entirely.
    expect(lines.some((line) => line.table === "sessions")).toBe(false);
    expect(lines.some((line) => line.table === "api_tokens")).toBe(false);
    // connections rows survive with credentials nulled.
    const connectionRows = lines.filter((line) => line.table === "connections");
    expect(connectionRows).toHaveLength(1);
    expect(connectionRows[0]?.row.credentials_enc).toBeNull();
    expect(connectionRows[0]?.row.id).toBe("conn-1");
    // Settings export through an ALLOWLIST: exactly these keys and
    // nothing else, so any future key stays private until it is
    // deliberately added.
    const settingKeys = lines
      .filter((line) => line.table === "settings")
      .map((line) => String(line.row.key));
    expect(new Set(settingKeys)).toEqual(
      new Set(["setup_complete", "home_timezone", "base_url"]),
    );
  });

  test("exports every portable table as valid JSONL with stable IDs", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedFullDatabase(testApp);

    const res = await fetchExport(testApp.app, cookie);
    const lines = parseLines(await res.text());

    const tables = new Set(lines.map((line) => line.table));
    expect(tables).toEqual(
      new Set([
        "entities",
        "calendar_events",
        "tasks",
        "links",
        "entity_aliases",
        "connections",
        "external_refs",
        "sync_cursors",
        "sync_runs",
        "settings",
        "schema_migrations",
      ]),
    );
    for (const line of lines) {
      expect(typeof line.table).toBe("string");
      expect(typeof line.row).toBe("object");
    }
    // IDs are ULIDs (or seeded strings) and round-trip untouched.
    const entityIds = lines
      .filter((line) => line.table === "entities")
      .map((line) => line.row.id);
    expect(entityIds).toContain("ent-1");
    expect(entityIds).toContain("ent-2");
  });

  test("names the download halero-export-<date>.jsonl", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const res = await fetchExport(testApp.app, cookie);
    await res.text();

    // clock.value = 1_700_000_000_000 is 2023-11-14 UTC.
    expect(res.headers.get("content-disposition")).toBe(
      "attachment; filename=halero-export-2023-11-14.jsonl",
    );
    expect(res.headers.get("content-type")).toContain("application/jsonl");
  });
});

describe("GET /api/export snapshot lifecycle", () => {
  test("reads from a temp snapshot and removes it afterward", async () => {
    const snapshotDir = mkdtempSync(join(tmpdir(), "halero-export-parent-"));
    const testApp = makeTestApp({ exportSnapshotDir: snapshotDir });
    const cookie = await completeSetup(testApp.app);
    seedFullDatabase(testApp);

    const res = await fetchExport(testApp.app, cookie);
    // Headers are out but the body is not consumed yet: the snapshot
    // must exist NOW, which proves the export reads a copy, not the
    // live database.
    expect(readdirSync(snapshotDir)).toHaveLength(1);

    const lines = parseLines(await res.text());
    expect(lines.length).toBeGreaterThan(0);
    // Fully drained: the snapshot is gone.
    expect(readdirSync(snapshotDir)).toHaveLength(0);
  });

  test("streams the snapshot, not the live database", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedFullDatabase(testApp);

    const res = await fetchExport(testApp.app, cookie);
    // The snapshot is taken before the response returns; a row committed
    // to the LIVE database now must never appear in the export body.
    testApp.database.db
      .insert(entities)
      .values({
        id: "ent-after-snapshot",
        kind: "note",
        schemaVersion: 1,
        source: "user",
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    const lines = parseLines(await res.text());

    expect(res.status).toBe(200);
    const entityIds = lines
      .filter((line) => line.table === "entities")
      .map((line) => line.row.id);
    expect(entityIds).toContain("ent-1");
    expect(entityIds).not.toContain("ent-after-snapshot");
  });

  test("does not create a snapshot for an unauthenticated request", async () => {
    const snapshotDir = mkdtempSync(join(tmpdir(), "halero-export-parent-"));
    const testApp = makeTestApp({ exportSnapshotDir: snapshotDir });
    await completeSetup(testApp.app);

    const res = await fetchExport(testApp.app);

    expect(res.status).toBe(401);
    expect(readdirSync(snapshotDir)).toHaveLength(0);
  });
});
