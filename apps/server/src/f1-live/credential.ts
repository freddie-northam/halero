// Storage for the user's OpenF1 live-timing credential (their own paid
// account username + password). It rides on the F1 connection's encrypted
// credentials_enc blob: the F1 connector's sync auth is "none" (the durable
// data is free), so the sync engine never reads this blob, and reusing the
// connection keeps one row per integration and one encryption path.

import { decryptCredentials, encryptCredentials } from "@halero/core";
import { connections, type HaleroDatabase } from "@halero/db";
import { eq } from "drizzle-orm";
import {
  getConnectionByConnectorId,
  upsertLocalConnection,
} from "../sync/connection";

export const F1_CONNECTOR_ID = "f1";

type Db = HaleroDatabase["db"];

/** The user's own OpenF1 account credentials for the paid live tier. */
export interface LiveCredential {
  readonly username: string;
  readonly password: string;
}

/**
 * Stores the live credential, creating the F1 connection first if the user
 * enabled live timing before connecting the free tier.
 */
export const storeLiveCredential = (
  db: Db,
  key: Uint8Array,
  now: number,
  credential: LiveCredential,
): void => {
  if (getConnectionByConnectorId(db, F1_CONNECTOR_ID) === null) {
    upsertLocalConnection(db, now, {
      connectorId: F1_CONNECTOR_ID,
      displayName: "F1",
    });
  }
  const blob = Buffer.from(encryptCredentials(key, JSON.stringify(credential)));
  db.update(connections)
    .set({ credentialsEnc: blob })
    .where(eq(connections.connectorId, F1_CONNECTOR_ID))
    .run();
};

/** Reads the live credential, or null when none is stored or it is unreadable. */
export const readLiveCredential = (
  db: Db,
  key: Uint8Array,
): LiveCredential | null => {
  const connection = getConnectionByConnectorId(db, F1_CONNECTOR_ID);
  if (connection === null || connection.credentialsEnc === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(
      decryptCredentials(key, connection.credentialsEnc),
    );
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).username === "string" &&
      typeof (parsed as Record<string, unknown>).password === "string"
    ) {
      const record = parsed as { username: string; password: string };
      return { username: record.username, password: record.password };
    }
    return null;
  } catch {
    return null;
  }
};

/** Clears the live credential but keeps the (free) connection connected. */
export const clearLiveCredential = (db: Db): void => {
  db.update(connections)
    .set({ credentialsEnc: null })
    .where(eq(connections.connectorId, F1_CONNECTOR_ID))
    .run();
};

export const hasLiveCredential = (db: Db, key: Uint8Array): boolean =>
  readLiveCredential(db, key) !== null;
