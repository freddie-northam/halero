import { googleCalendarConnector } from "@halero/connector-google-calendar";
import { asRecord, stringOrNull } from "@halero/connector-sdk";
import { encryptCredentials, ulid } from "@halero/core";
import { connections, type HaleroDatabase } from "@halero/db";
import { eq } from "drizzle-orm";

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

export const getGoogleConnection = (db: Db): ConnectionRow | null =>
  db
    .select()
    .from(connections)
    .where(eq(connections.connectorId, GOOGLE_CONNECTOR_ID))
    .get() ?? null;

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
export const upsertConnection = (
  db: Db,
  key: Uint8Array,
  now: number,
  target: UpsertConnectionTarget,
  identity: ConnectionIdentity,
  tokens: StoredOauthTokens,
): void => {
  const config = JSON.stringify(identity);
  const credentialsEnc = Buffer.from(
    encryptCredentials(key, JSON.stringify(tokens)),
  );
  const existing = db
    .select()
    .from(connections)
    .where(eq(connections.connectorId, target.connectorId))
    .get();
  if (existing !== undefined) {
    // A fresh sign-in wipes the failure history: the scheduler's status
    // filter never reschedules reauth_required rows, so this reset (with
    // next_sync_at = now) is what makes the connection due again.
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
