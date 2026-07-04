// The host's connector registry. Every connector is validated at
// registration (manifest shape, protocol version, and the produced-kind
// rule against the module registry) so a mismatch fails loudly at boot,
// not mid-sync. The registry type is nominal: the only way to get one,
// in production or tests, is through registerConnectors, so an
// unvalidated connector can never reach the sync engine.

import { googleCalendarConnector } from "@halero/connector-google-calendar";
import { openf1Connector } from "@halero/connector-openf1";
import {
  type Connector,
  connectorManifestSchema,
  PROTOCOL_VERSION,
} from "@halero/connector-sdk";
import {
  assertProducedKindSupported,
  type KindRegistry,
} from "@halero/module-sdk/server";
import { kindRegistry } from "../registry";

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

/**
 * Validated connector lookup. The private field makes the type nominal:
 * a hand-built map can never pass as one, which is what guarantees every
 * registry the engine sees went through registration validation.
 */
class ValidatedConnectorRegistry {
  readonly #byId: ReadonlyMap<string, AnyConnector>;

  constructor(byId: ReadonlyMap<string, AnyConnector>) {
    this.#byId = byId;
  }

  get(id: string): AnyConnector | undefined {
    return this.#byId.get(id);
  }
}

export type ConnectorRegistry = ValidatedConnectorRegistry;

export const registerConnectors = (
  connectors: readonly AnyConnector[],
  kinds: KindRegistry,
): ConnectorRegistry => {
  const byId = new Map<string, AnyConnector>();
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
    for (const produced of manifest.data.produces) {
      assertProducedKindSupported(kinds, manifest.data.id, produced);
    }
    byId.set(manifest.data.id, connector);
  }
  return new ValidatedConnectorRegistry(byId);
};

/** The connectors this build ships with, validated against its modules. */
export const connectorRegistry: ConnectorRegistry = registerConnectors(
  [googleCalendarConnector, openf1Connector],
  kindRegistry,
);

export const requireConnector = (id: string): AnyConnector => {
  const connector = connectorRegistry.get(id);
  if (connector === undefined) {
    throw new Error(`The "${id}" connector is not part of this Halero build.`);
  }
  return connector;
};
