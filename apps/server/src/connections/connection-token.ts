// The bridge an activity consumer (e.g. the Progress heatmap) uses to read
// the decrypted token of an apiKey connection it depends on. The connection
// framework owns storage + connect/disconnect; the consumer only reads.

import type { HaleroDatabase } from "@halero/db";
import { readApiKeyToken } from "../sync/api-key-credential";
import { getConnectionByConnectorId } from "../sync/connection";

type Db = HaleroDatabase["db"];

/** True when a connection row exists for the connector. */
export const isConnected = (db: Db, connectorId: string): boolean =>
  getConnectionByConnectorId(db, connectorId) !== null;

/**
 * Returns the decrypted apiKey token for a connected connector, or null
 * when it is not connected. Throws (readably) only when the stored blob
 * cannot be decrypted, which a caller surfaces as "reconnect".
 */
export const readConnectionToken = (
  db: Db,
  key: Uint8Array,
  connectorId: string,
): string | null => {
  const connection = getConnectionByConnectorId(db, connectorId);
  if (connection === null) {
    return null;
  }
  return readApiKeyToken(key, connection);
};
