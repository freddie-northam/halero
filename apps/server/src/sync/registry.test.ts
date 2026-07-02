import { describe, expect, test } from "bun:test";
import { googleCalendarConnector } from "@halero/connector-google-calendar";
import type { Connector, ConnectorManifest } from "@halero/connector-sdk";
import { z } from "zod";
import { type AnyConnector, registerConnectors } from "./registry";

const fakeConnector = (manifest: ConnectorManifest): AnyConnector => {
  const connector: Connector<Record<string, never>> = {
    manifest,
    auth: {
      authorizationEndpoint: "https://auth.example.com/authorize",
      tokenEndpoint: "https://auth.example.com/token",
      scopes: ["readonly"],
    },
    configSchema: z.object({}),
    identify: () => null,
    discoverStreams: () => Promise.resolve([]),
    sync: async function* () {
      yield [];
      return {};
    },
  };
  return connector;
};

describe("registerConnectors", () => {
  test("registers connectors under their manifest ids", () => {
    const registry = registerConnectors([googleCalendarConnector]);

    expect(registry.get("google-calendar")).toBe(googleCalendarConnector);
  });

  test("rejects a protocol version mismatch with a readable error", () => {
    const future = fakeConnector({
      id: "time-machine",
      version: "9.0.0",
      protocolVersion: 99,
      capabilities: ["poll"],
      produces: [],
    });

    const outcome = (() => {
      try {
        registerConnectors([future]);
        return null;
      } catch (error) {
        return error;
      }
    })();

    if (!(outcome instanceof Error)) {
      throw new Error("expected registration to throw");
    }
    // The message must name the connector and both versions so a
    // self-hoster knows which side to update.
    expect(outcome.message).toContain("time-machine");
    expect(outcome.message).toContain("99");
    expect(outcome.message).toContain("version 1");
    expect(outcome.message).toContain("Update");
  });

  test("rejects a malformed manifest before it can half-register", () => {
    const malformed = fakeConnector({
      id: "",
      version: "1.0.0",
      protocolVersion: 1,
      capabilities: ["poll"],
      produces: [],
    });

    expect(() => registerConnectors([malformed])).toThrow(/manifest/);
  });
});
