import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { encryptCredentials } from "@halero/core";
import {
  encryptApiKeyCredential,
  parseApiKeyCredential,
  readApiKeyToken,
} from "./api-key-credential";
import type { ConnectionRow } from "./connection";

const KEY = new Uint8Array(randomBytes(32));

const row = (credentialsEnc: Buffer | null): ConnectionRow => ({
  id: "conn_1",
  connectorId: "github",
  displayName: "GitHub",
  config: null,
  credentialsEnc,
  status: "active",
  syncIntervalSec: 300,
  nextSyncAt: null,
  consecutiveFailures: 0,
  lastError: null,
  createdAt: 0,
});

describe("api-key credential", () => {
  test("round-trips a token through encrypt + read", () => {
    const blob = Buffer.from(encryptApiKeyCredential(KEY, "ghp_secret123"));
    expect(readApiKeyToken(KEY, row(blob))).toBe("ghp_secret123");
  });

  test("throws readably when the connection has no credentials", () => {
    expect(() => readApiKeyToken(KEY, row(null))).toThrow(
      /no saved access token/i,
    );
  });

  test("throws readably when the blob was written with another key", () => {
    const blob = Buffer.from(encryptApiKeyCredential(KEY, "ghp_secret123"));
    const otherKey = new Uint8Array(randomBytes(32));
    expect(() => readApiKeyToken(otherKey, row(blob))).toThrow(
      /could not be read/i,
    );
  });

  test("throws readably when the decrypted blob is not a { token } shape", () => {
    const blob = Buffer.from(
      encryptCredentials(KEY, JSON.stringify({ nope: 1 })),
    );
    expect(() => readApiKeyToken(KEY, row(blob))).toThrow(
      /no saved access token/i,
    );
  });

  test("parseApiKeyCredential returns null for non-JSON and non-token payloads", () => {
    expect(parseApiKeyCredential("not json")).toBeNull();
    expect(parseApiKeyCredential(JSON.stringify({ token: 42 }))).toBeNull();
    expect(parseApiKeyCredential(JSON.stringify({ token: "t" }))).toBe("t");
  });
});
