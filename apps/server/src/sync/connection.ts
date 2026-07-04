import { googleCalendarConnector } from "@halero/connector-google-calendar";
import { asRecord, stringOrNull } from "@halero/connector-sdk";
import { encryptCredentials, ulid } from "@halero/core";
import { connections, type HaleroDatabase, syncCursors } from "@halero/db";
import { eq } from "drizzle-orm";
import { encryptApiKeyCredential } from "./api-key-credential";

type Db = HaleroDatabase["db"];

export type ConnectionRow = typeof connections.$inferSelect;

/** The single Google Calendar connector id, from its manifest. */
export const GOOGLE_CONNECTOR_ID = googleCalendarConnector.manifest.id;

/** Stored in the connection's config column, for display and account keying. */
export interface ConnectionIdentity {
  readonly email: string | null;
  readonly accountKey: string;
}

/** Stored AES-GCM encrypted in the connection's credentials_enc column. */
export interface StoredOauthTokens {
  readonly refreshToken: string;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: number;
}

export const getConnectionByConnectorId = (
  db: Db,
  connectorId: string,
): ConnectionRow | null =>
  db
    .select()
    .from(connections)
    .where(eq(connections.connectorId, connectorId))
    .get() ?? null;

export const getGoogleConnection = (db: Db): ConnectionRow | null =>
  getConnectionByConnectorId(db, GOOGLE_CONNECTOR_ID);

/**
 * Removes a connection and the cursors keyed to it, and (because the
 * credentials live on the row) its stored secret. Already-synced entities
 * and external_refs stay: external_refs key off connector_id + account_key,
 * so reconnecting the same account reuses its identity.
 */
export const deleteConnection = (db: Db, connectorId: string): boolean => {
  const existing = getConnectionByConnectorId(db, connectorId);
  if (existing === null) {
    return false;
  }
  db.delete(syncCursors).where(eq(syncCursors.connectionId, existing.id)).run();
  db.delete(connections).where(eq(connections.id, existing.id)).run();
  return true;
};

export const parseConnectionConfig = (
  row: ConnectionRow,
): ConnectionIdentity | null => {
  if (row.config === null) {
    return null;
  }
  try {
    const record = asRecord(JSON.parse(row.config));
    const accountKey = record === null ? null : stringOrNull(record.accountKey);
    if (record === null || accountKey === null) {
      return null;
    }
    return { email: stringOrNull(record.email), accountKey };
  } catch {
    return null;
  }
};

export interface UpsertConnectionTarget {
  readonly connectorId: string;
  readonly displayName: string;
}

/**
 * There is a single connection per connector in v0.1. Reconnecting
 * updates that row in place; identity stays keyed to the provider
 * account (`accountKey`, e.g. the id_token `sub`), so existing external
 * refs survive.
 */
/**
 * Writes (or reconnects, in place) a connection row with a ready-made
 * config + encrypted credentials blob. A fresh connect wipes the failure
 * history: the scheduler's status filter never reschedules reauth_required
 * rows, so this reset (with next_sync_at = now) is what makes the
 * connection due again. Identity stays keyed to the provider account, so
 * existing external refs survive a reconnect.
 */
const writeConnection = (
  db: Db,
  now: number,
  target: UpsertConnectionTarget,
  config: string,
  credentialsEnc: Buffer | null,
): void => {
  const existing = getConnectionByConnectorId(db, target.connectorId);
  if (existing !== null) {
    db.update(connections)
      .set({
        config,
        credentialsEnc,
        status: "active",
        lastError: null,
        nextSyncAt: now,
        consecutiveFailures: 0,
      })
      .where(eq(connections.id, existing.id))
      .run();
    return;
  }
  db.insert(connections)
    .values({
      id: ulid(now),
      connectorId: target.connectorId,
      displayName: target.displayName,
      config,
      credentialsEnc,
      status: "active",
      nextSyncAt: now,
      createdAt: now,
    })
    .run();
};

/** Connects (or reconnects) an OAuth2 account with refreshable tokens. */
export const upsertConnection = (
  db: Db,
  key: Uint8Array,
  now: number,
  target: UpsertConnectionTarget,
  identity: ConnectionIdentity,
  tokens: StoredOauthTokens,
): void =>
  writeConnection(
    db,
    now,
    target,
    JSON.stringify(identity),
    Buffer.from(encryptCredentials(key, JSON.stringify(tokens))),
  );

/**
 * Connects (or reconnects) a static-token (apiKey) account. There is no
 * OIDC identity, so the account label doubles as the account key; that is
 * enough for a single-connection-per-connector world.
 */
export const upsertApiKeyConnection = (
  db: Db,
  key: Uint8Array,
  now: number,
  target: UpsertConnectionTarget,
  accountLabel: string,
  token: string,
): void =>
  writeConnection(
    db,
    now,
    target,
    JSON.stringify({ email: accountLabel, accountKey: accountLabel }),
    Buffer.from(encryptApiKeyCredential(key, token)),
  );

/**
 * Connects a local, credential-free source (a log or database Halero reads
 * from disk). There is nothing to store but the row itself, which is what
 * marks the source connected.
 */
export const upsertLocalConnection = (
  db: Db,
  now: number,
  target: UpsertConnectionTarget,
): void =>
  writeConnection(
    db,
    now,
    target,
    JSON.stringify({ email: null, accountKey: target.connectorId }),
    null,
  );
