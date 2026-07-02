import { describe, expect, test } from "bun:test";
import { googleCalendarConnector } from "@halero/connector-google-calendar";
import type { Connector, ConnectorManifest } from "@halero/connector-sdk";
import {
  buildKindRegistry,
  type KindRegistry,
  type ServerModule,
} from "@halero/module-sdk/server";
import { z } from "zod";
import { kindRegistry } from "../registry";
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

const widgetManifest = (schemaVersion: number): ConnectorManifest => ({
  id: "widget-connector",
  version: "1.0.0",
  protocolVersion: 1,
  capabilities: ["poll"],
  produces: [{ kind: "widget.gadget", schemaVersion }],
});

const widgetKinds = (
  schemaVersion: number,
  upcasts?: Readonly<
    Record<number, (old: Record<string, unknown>) => Record<string, unknown>>
  >,
): KindRegistry => {
  const module: ServerModule = {
    id: "widgets",
    version: "0.0.1",
    entityKinds: [
      {
        kind: "widget.gadget",
        schemaVersion,
        schema: z.record(z.string(), z.unknown()),
        ...(upcasts === undefined ? {} : { upcasts }),
      },
    ],
  };
  return buildKindRegistry([module]);
};

const caught = (run: () => void): Error => {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error("expected an Error to be thrown");
  }
  throw new Error("expected the call to throw");
};

describe("registerConnectors", () => {
  test("registers connectors under their manifest ids", () => {
    const registry = registerConnectors(
      [googleCalendarConnector],
      kindRegistry,
    );

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

    const outcome = caught(() => registerConnectors([future], kindRegistry));

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

    expect(() => registerConnectors([malformed], kindRegistry)).toThrow(
      /manifest/,
    );
  });

  test("rejects a connector producing a kind no module registers", () => {
    const rogue = fakeConnector(widgetManifest(1));

    const outcome = caught(() => registerConnectors([rogue], kindRegistry));

    expect(outcome.message).toContain('"widget-connector"');
    expect(outcome.message).toContain('"widget.gadget"');
    expect(outcome.message).toContain("no module");
  });

  test("rejects a produced schema version newer than the module's", () => {
    const rogue = fakeConnector(widgetManifest(3));

    const outcome = caught(() =>
      registerConnectors([rogue], widgetKinds(2, { 1: (old) => old })),
    );

    expect(outcome.message).toContain("3");
    expect(outcome.message).toContain("2");
    expect(outcome.message).toContain("Update Halero");
  });

  test("rejects an older produced version when an upcast step is missing", () => {
    const rogue = fakeConnector(widgetManifest(1));

    const outcome = caught(() =>
      registerConnectors([rogue], widgetKinds(3, { 2: (old) => old })),
    );

    expect(outcome.message).toContain("1 to 2");
    expect(outcome.message).toContain('"widgets"');
  });

  test("accepts an older produced version with a complete upcast chain", () => {
    const older = fakeConnector(widgetManifest(1));
    const kinds = widgetKinds(3, {
      1: (old) => old,
      2: (old) => old,
    });

    const registry = registerConnectors([older], kinds);

    expect(registry.get("widget-connector")).toBe(older);
  });
});
