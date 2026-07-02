import { describe, expect, test } from "bun:test";
import {
  defineConnector,
  PROTOCOL_VERSION,
  type SyncOp,
  type UpsertSyncOp,
} from "@halero/connector-sdk";
import { entities } from "@halero/db";
import {
  buildKindRegistry,
  defineServerModule,
  type ModuleDb,
} from "@halero/module-sdk/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { makeTestApp, type TestApp } from "../test-utils";
import { type SyncEngineContext, syncConnection } from "./engine";
import { registerConnectors } from "./registry";

// A synthetic v1 -> v2 module/connector pair: the module registers
// widget.gadget at schema version 2 with an upcast from 1, the echo
// connector still produces version 1. The engine must upgrade the
// payload and store the row at the REGISTERED version.

const CONNECTION_ID = "conn-widgets";
const CONNECTOR_ID = "widget-echo";

interface CapturedWrite {
  readonly entityId: string;
  readonly op: UpsertSyncOp;
}

const widgetModule = (captured: CapturedWrite[]) =>
  defineServerModule({
    id: "widgets",
    version: "0.0.1",
    entityKinds: [
      {
        kind: "widget.gadget",
        schemaVersion: 2,
        schema: z.object({ label: z.string() }),
        upcasts: {
          // v1 called the label "name"; v2 renames it.
          1: (old: Record<string, unknown>) => ({
            label: String(old.name ?? ""),
          }),
        },
        satelliteWriter: (
          _db: ModuleDb,
          entityId: string,
          op: UpsertSyncOp,
        ) => {
          captured.push({ entityId, op });
        },
      },
    ],
  });

const echoConnector = (pages: SyncOp[][]) =>
  defineConnector({
    manifest: {
      id: CONNECTOR_ID,
      version: "0.0.1",
      protocolVersion: PROTOCOL_VERSION,
      capabilities: ["poll"],
      produces: [{ kind: "widget.gadget", schemaVersion: 1 }],
    },
    auth: {
      authorizationEndpoint: "https://example.com/auth",
      tokenEndpoint: "https://example.com/token",
      scopes: ["readonly"],
    },
    configSchema: z.object({}),
    identify: () => null,
    discoverStreams: () => Promise.resolve([{ id: "widgets" }]),
    sync: async function* () {
      for (const page of pages) {
        yield page;
      }
      return { nextCursor: "echo-cursor" };
    },
  });

const seedWidgetConnection = (testApp: TestApp): void => {
  testApp.database.sqlite.run(
    `INSERT INTO connections (id, connector_id, display_name, config, status, next_sync_at, created_at)
     VALUES (?, ?, 'Widgets', ?, 'active', ?, ?)`,
    [
      CONNECTION_ID,
      CONNECTOR_ID,
      JSON.stringify({ email: "w@example.com", accountKey: "widget-acct" }),
      testApp.clock.value,
      testApp.clock.value,
    ],
  );
};

const upcastContext = (
  testApp: TestApp,
  pages: SyncOp[][],
  captured: CapturedWrite[],
): SyncEngineContext => {
  const kinds = buildKindRegistry([widgetModule(captured)]);
  return {
    database: testApp.database,
    key: testApp.key,
    now: () => testApp.clock.value,
    outboundFetch: () => Promise.reject(new Error("no network expected")),
    registry: registerConnectors([echoConnector(pages)], kinds),
    kinds,
    log: () => undefined,
  };
};

const v1Op = (name: string): SyncOp => ({
  op: "upsert",
  externalId: "gadget-1",
  version: '"g1-v1"',
  spine: { kind: "widget.gadget", schemaVersion: 1, title: name },
  satellite: { name },
});

const getEntity = (testApp: TestApp, externalId: string) => {
  const ref = testApp.database.sqlite
    .query<{ entity_id: string }, [string]>(
      "SELECT entity_id FROM external_refs WHERE external_id = ?",
    )
    .get(externalId);
  if (ref === null) {
    throw new Error(`expected an external ref for ${externalId}`);
  }
  return testApp.database.db
    .select()
    .from(entities)
    .where(eq(entities.id, ref.entity_id))
    .get();
};

describe("syncConnection upcasts", () => {
  test("stores rows at the registered version after upcasting the payload", async () => {
    const testApp = makeTestApp();
    seedWidgetConnection(testApp);
    const captured: CapturedWrite[] = [];

    const summary = await syncConnection(
      upcastContext(testApp, [[v1Op("Gizmo")]], captured),
      CONNECTION_ID,
    );

    expect(summary).toEqual({
      status: "success",
      upserts: 1,
      deletes: 0,
      error: null,
    });
    // entities.schema_version reflects the REGISTERED version, not the
    // version the connector produced.
    const entity = getEntity(testApp, "gadget-1");
    expect(entity?.kind).toBe("widget.gadget");
    expect(entity?.schemaVersion).toBe(2);
    expect(entity?.title).toBe("Gizmo");
    // The satellite writer saw the upcast payload at the new version.
    expect(captured).toHaveLength(1);
    expect(captured[0]?.op.spine.schemaVersion).toBe(2);
    expect(captured[0]?.op.satellite).toEqual({ label: "Gizmo" });
  });

  test("fails readably when a connector emits a version newer than registered", async () => {
    const testApp = makeTestApp();
    seedWidgetConnection(testApp);
    const captured: CapturedWrite[] = [];
    const tooNew: SyncOp = {
      op: "upsert",
      externalId: "gadget-9",
      spine: { kind: "widget.gadget", schemaVersion: 3 },
      satellite: { label: "From the future" },
    };

    const summary = await syncConnection(
      upcastContext(testApp, [[tooNew]], captured),
      CONNECTION_ID,
    );

    expect(summary.status).toBe("failed");
    expect(summary.error).toContain("widget.gadget");
    expect(summary.error).toContain("3");
    expect(summary.error).toContain("Update Halero");
    expect(summary.upserts).toBe(0);
    expect(captured).toHaveLength(0);
  });

  test("skips upcasting when the produced version already matches", async () => {
    const testApp = makeTestApp();
    seedWidgetConnection(testApp);
    const captured: CapturedWrite[] = [];
    const current: SyncOp = {
      op: "upsert",
      externalId: "gadget-2",
      version: '"g2-v1"',
      spine: { kind: "widget.gadget", schemaVersion: 2, title: "Widget" },
      satellite: { label: "Already current" },
    };

    const summary = await syncConnection(
      upcastContext(testApp, [[current]], captured),
      CONNECTION_ID,
    );

    expect(summary.status).toBe("success");
    expect(getEntity(testApp, "gadget-2")?.schemaVersion).toBe(2);
    expect(captured[0]?.op.satellite).toEqual({ label: "Already current" });
  });
});
