import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encryptCredentials } from "@halero/core";
import {
  coreMigrations,
  type HaleroDatabase,
  openDatabase,
  runMigrations,
} from "@halero/db";
import { setSetting } from "../settings";
import {
  isHttpsOk,
  isOauthClientConfigured,
  oauthRedirectUri,
  readOauthClient,
  saveOauthClient,
} from "./oauth-client";

const KEY = new Uint8Array(randomBytes(32));

const openMigrated = (): HaleroDatabase => {
  const dir = mkdtempSync(join(tmpdir(), "halero-oauth-client-"));
  const handle = openDatabase(join(dir, "halero.db"));
  runMigrations(handle.sqlite, {
    migrations: coreMigrations,
    backupsDir: join(dir, "backups"),
  });
  return handle;
};

describe("isHttpsOk", () => {
  test("accepts https on any host and http only on loopback", () => {
    expect(isHttpsOk(new URL("https://halero.example.com"))).toBe(true);
    expect(isHttpsOk(new URL("http://localhost:4253"))).toBe(true);
    expect(isHttpsOk(new URL("http://[::1]:4253"))).toBe(true);
    expect(isHttpsOk(new URL("http://halero.example.com"))).toBe(false);
  });
});

describe("oauthRedirectUri", () => {
  test("is namespaced by connector id", () => {
    expect(
      oauthRedirectUri(new URL("https://h.example"), "google-calendar"),
    ).toBe("https://h.example/api/oauth/google-calendar/callback");
  });
});

describe("oauth client storage", () => {
  test("round-trips a client under namespaced keys", () => {
    const { db } = openMigrated();
    expect(isOauthClientConfigured(db, "google-calendar")).toBe(false);
    saveOauthClient(db, KEY, "google-calendar", {
      clientId: "id-123",
      clientSecret: "secret-456",
    });
    expect(isOauthClientConfigured(db, "google-calendar")).toBe(true);
    expect(readOauthClient(db, KEY, "google-calendar", "Google")).toEqual({
      clientId: "id-123",
      clientSecret: "secret-456",
    });
  });

  test("falls back to the legacy Google keys when namespaced keys are absent", () => {
    const { db } = openMigrated();
    setSetting(db, "google_oauth_client_id", "legacy-id");
    setSetting(
      db,
      "google_oauth_client_secret_enc",
      Buffer.from(encryptCredentials(KEY, "legacy-secret")).toString("base64"),
    );
    expect(isOauthClientConfigured(db, "google-calendar")).toBe(true);
    expect(readOauthClient(db, KEY, "google-calendar", "Google")).toEqual({
      clientId: "legacy-id",
      clientSecret: "legacy-secret",
    });
  });

  test("returns null for an unconfigured non-Google connector", () => {
    const { db } = openMigrated();
    expect(readOauthClient(db, KEY, "notion", "Notion")).toBeNull();
    expect(isOauthClientConfigured(db, "notion")).toBe(false);
  });
});
