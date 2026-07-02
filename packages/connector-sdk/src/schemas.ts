// Runtime validation for the connector protocol. Every SyncOp crossing
// the connector boundary must be strictly JSON-serializable so the
// boundary can later become a process boundary.

import { z } from "zod";
import type { ConnectorManifest, SyncOp, SyncStreamResult } from "./types";

const JSON_ONLY_MESSAGE =
  "Sync operations must be plain JSON data: objects, arrays, strings, " +
  "finite numbers, booleans, and null.";

/**
 * True only for values JSON.stringify would reproduce exactly: no class
 * instances (Dates included), no functions, no undefined inside
 * containers, no NaN or Infinity.
 */
export const isJsonValue = (value: unknown): boolean => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  return Object.values(value).every(isJsonValue);
};

const jsonValueSchema = z.unknown().refine(isJsonValue, JSON_ONLY_MESSAGE);

const jsonRecordSchema = z
  .record(z.string(), z.unknown())
  .refine(isJsonValue, JSON_ONLY_MESSAGE);

const syncOpSpineSchema = z.strictObject({
  kind: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  title: z.string().optional(),
  snippet: z.string().optional(),
  occurredStart: z.number().int().optional(),
  occurredEnd: z.number().int().optional(),
});

const upsertSyncOpSchema = z.strictObject({
  op: z.literal("upsert"),
  externalId: z.string().min(1),
  version: z.string().optional(),
  spine: syncOpSpineSchema,
  satellite: jsonRecordSchema.optional(),
  raw: jsonValueSchema.optional(),
});

const deleteSyncOpSchema = z.strictObject({
  op: z.literal("delete"),
  externalId: z.string().min(1),
});

export const syncOpSchema: z.ZodType<SyncOp> = z.discriminatedUnion("op", [
  upsertSyncOpSchema,
  deleteSyncOpSchema,
]);

/** Connectors yield pages as ARRAYS so hosts can commit page-per-transaction. */
export const syncOpsPageSchema: z.ZodType<SyncOp[]> = z.array(syncOpSchema);

/**
 * The sync generator's return value. replayWindowStart is additive and
 * optional, so protocol version 1 connectors stay valid unchanged.
 */
export const syncStreamResultSchema: z.ZodType<SyncStreamResult> =
  z.strictObject({
    nextCursor: z.string().optional(),
    replayWindowStart: z.number().int().optional(),
  });

export const connectorManifestSchema: z.ZodType<ConnectorManifest> =
  z.strictObject({
    id: z.string().min(1),
    version: z.string().min(1),
    protocolVersion: z.number().int().positive(),
    capabilities: z
      .array(z.enum(["oauth2", "apiKey", "poll", "webhook"]))
      .min(1),
    produces: z.array(
      z.strictObject({
        kind: z.string().min(1),
        schemaVersion: z.number().int().positive(),
      }),
    ),
  });
