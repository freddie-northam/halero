import { describe, expect, test } from "bun:test";
import {
  type ConnectorManifest,
  connectorManifestSchema,
  PROTOCOL_VERSION,
  type SyncOp,
  syncOpSchema,
  syncOpsPageSchema,
  syncStreamResultSchema,
} from "./index";

const fullUpsert = {
  op: "upsert",
  externalId: "evt-1",
  version: '"etag-1"',
  spine: {
    kind: "calendar.event",
    schemaVersion: 1,
    title: "Standup",
    snippet: "Daily sync call",
    occurredStart: 1_700_000_000_000,
    occurredEnd: 1_700_000_900_000,
  },
  satellite: { calendarId: "primary", allDay: 0, location: null },
  raw: { id: "evt-1", attendees: [{ email: "a@example.com" }] },
} satisfies SyncOp;

describe("syncOpSchema", () => {
  test("accepts a fully populated upsert op", () => {
    expect(syncOpSchema.parse(fullUpsert)).toEqual(fullUpsert);
  });

  test("accepts a minimal upsert op", () => {
    const minimal = {
      op: "upsert",
      externalId: "evt-1",
      spine: { kind: "calendar.event", schemaVersion: 1 },
    } satisfies SyncOp;

    expect(syncOpSchema.parse(minimal)).toEqual(minimal);
  });

  test("accepts a delete op", () => {
    const op = { op: "delete", externalId: "evt-1" } satisfies SyncOp;

    expect(syncOpSchema.parse(op)).toEqual(op);
  });

  test("survives a JSON round-trip unchanged", () => {
    // The connector boundary must be able to become a process boundary:
    // an op serialized and parsed back has to mean the same thing.
    const roundTripped: unknown = JSON.parse(JSON.stringify(fullUpsert));

    expect(syncOpSchema.parse(roundTripped)).toEqual(fullUpsert);
  });

  test("rejects an unknown op", () => {
    const parsed = syncOpSchema.safeParse({ op: "merge", externalId: "x" });

    expect(parsed.success).toBe(false);
  });

  test("rejects fields the protocol does not define", () => {
    const parsed = syncOpSchema.safeParse({
      ...fullUpsert,
      webhookSecret: "shh",
    });

    expect(parsed.success).toBe(false);
  });

  test("rejects a satellite JSON cannot represent", () => {
    const withDate = { ...fullUpsert, satellite: { seen: new Date() } };
    const withFunction = { ...fullUpsert, satellite: { cb: () => 1 } };
    const withNan = { ...fullUpsert, satellite: { allDay: Number.NaN } };

    expect(syncOpSchema.safeParse(withDate).success).toBe(false);
    expect(syncOpSchema.safeParse(withFunction).success).toBe(false);
    expect(syncOpSchema.safeParse(withNan).success).toBe(false);
  });

  test("rejects a raw payload JSON cannot represent", () => {
    const parsed = syncOpSchema.safeParse({
      ...fullUpsert,
      raw: { when: new Date() },
    });

    expect(parsed.success).toBe(false);
  });
});

describe("syncOpsPageSchema", () => {
  test("validates pages as arrays of ops", () => {
    const page: SyncOp[] = [fullUpsert, { op: "delete", externalId: "evt-2" }];

    expect(syncOpsPageSchema.parse(page)).toEqual(page);
  });

  test("rejects a bare op that is not wrapped in a page array", () => {
    expect(syncOpsPageSchema.safeParse(fullUpsert).success).toBe(false);
  });
});

describe("syncStreamResultSchema", () => {
  test("accepts an empty result", () => {
    expect(syncStreamResultSchema.parse({})).toEqual({});
  });

  test("accepts a cursor together with a replay window start", () => {
    const result = {
      nextCursor: "sync-token-2",
      replayWindowStart: 1_668_464_000_000,
    };

    expect(syncStreamResultSchema.parse(result)).toEqual(result);
  });

  test("rejects a non-numeric replayWindowStart", () => {
    const parsed = syncStreamResultSchema.safeParse({
      replayWindowStart: "one year ago",
    });

    expect(parsed.success).toBe(false);
  });

  test("rejects a fractional replayWindowStart", () => {
    const parsed = syncStreamResultSchema.safeParse({
      replayWindowStart: 1_668_464_000_000.5,
    });

    expect(parsed.success).toBe(false);
  });

  test("rejects fields the protocol does not define", () => {
    const parsed = syncStreamResultSchema.safeParse({
      nextCursor: "cur",
      sweepEverything: true,
    });

    expect(parsed.success).toBe(false);
  });
});

describe("connectorManifestSchema", () => {
  const manifest = {
    id: "google-calendar",
    version: "0.1.0",
    protocolVersion: PROTOCOL_VERSION,
    capabilities: ["oauth2", "poll"],
    produces: [{ kind: "calendar.event", schemaVersion: 1 }],
  } satisfies ConnectorManifest;

  test("accepts a well-formed manifest", () => {
    expect(connectorManifestSchema.parse(manifest)).toEqual(manifest);
  });

  test("rejects a capability outside the protocol enum", () => {
    const parsed = connectorManifestSchema.safeParse({
      ...manifest,
      capabilities: ["oauth2", "carrier-pigeon"],
    });

    expect(parsed.success).toBe(false);
  });

  test("rejects a fractional protocol version", () => {
    const parsed = connectorManifestSchema.safeParse({
      ...manifest,
      protocolVersion: 1.5,
    });

    expect(parsed.success).toBe(false);
  });
});
