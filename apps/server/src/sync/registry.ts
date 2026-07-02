// The host's connector registry. Hardcoded to the Google Calendar
// connector for now; Task 9's module SDK replaces this with dynamic
// registration. Every connector is validated at registration so a
// protocol mismatch fails loudly at boot, not mid-sync.

import { googleCalendarConnector } from "@halero/connector-google-calendar";
import {
  type Connector,
  connectorManifestSchema,
  PROTOCOL_VERSION,
} from "@halero/connector-sdk";

/** A connector with its config type erased for host-side handling. */
export type AnyConnector = Connector<unknown>;

const MALFORMED_MANIFEST_MESSAGE =
  "A connector could not be registered because its manifest is malformed. " +
  "Update or rebuild the connector package.";

const protocolMismatchMessage = (id: string, protocolVersion: number): string =>
  `The "${id}" connector speaks connector protocol version ` +
  `${protocolVersion}, but this Halero build speaks version ` +
  `${PROTOCOL_VERSION}. Update ` +
  `${protocolVersion > PROTOCOL_VERSION ? "Halero" : "the connector"} ` +
  "so both sides match.";

export const registerConnectors = (
  connectors: readonly AnyConnector[],
): ReadonlyMap<string, AnyConnector> => {
  const registry = new Map<string, AnyConnector>();
  for (const connector of connectors) {
    const manifest = connectorManifestSchema.safeParse(connector.manifest);
    if (!manifest.success) {
      throw new Error(MALFORMED_MANIFEST_MESSAGE);
    }
    if (manifest.data.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(
        protocolMismatchMessage(
          manifest.data.id,
          manifest.data.protocolVersion,
        ),
      );
    }
    registry.set(manifest.data.id, connector);
  }
  return registry;
};

/** The connectors this build ships with. */
export const connectorRegistry: ReadonlyMap<string, AnyConnector> =
  registerConnectors([googleCalendarConnector]);

export const requireConnector = (id: string): AnyConnector => {
  const connector = connectorRegistry.get(id);
  if (connector === undefined) {
    throw new Error(`The "${id}" connector is not part of this Halero build.`);
  }
  return connector;
};
