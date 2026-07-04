// The OpenF1 connector: syncs the current F1 season's sessions into
// f1.session spine entities from the FREE, no-auth OpenF1 endpoints. Live
// timing (paid) is NOT synced here; it is proxied on demand by the F1
// module. Because the durable data is public, the connector's auth is
// "none" and its connection is created with connectLocal.

import {
  defineConnector,
  PROTOCOL_VERSION,
  type StreamDef,
  type SyncContext,
  type SyncOp,
  type SyncStreamResult,
  stringOrNull,
} from "@halero/connector-sdk";
import { F1_SESSION_KIND } from "@halero/schemas";
import { z } from "zod";
import {
  F1_SESSION_SCHEMA_VERSION,
  type MeetingInfo,
  mapSession,
} from "./map-session";
import { getRows } from "./openf1";

export const openf1ConfigSchema = z.object({
  homeTimezone: z.string().min(1),
});

export type OpenF1Config = z.infer<typeof openf1ConfigSchema>;

/** One stream: the whole current season, replayed each sync. */
const SEASON_STREAM: StreamDef = { id: "season", displayName: "Season" };

const currentYear = (now: number): number => new Date(now).getUTCFullYear();

/** Builds a meeting_key -> display-fields lookup for the season. */
const loadMeetings = async (
  ctx: SyncContext<OpenF1Config>,
  year: number,
): Promise<Map<number, MeetingInfo>> => {
  const rows = await getRows(ctx.fetch, `meetings?year=${year}`);
  const byKey = new Map<number, MeetingInfo>();
  for (const row of rows) {
    const key = row.meeting_key;
    if (typeof key !== "number") {
      continue;
    }
    byKey.set(key, {
      meetingName: stringOrNull(row.meeting_name),
      countryFlagUrl: stringOrNull(row.country_flag),
      circuitImageUrl: stringOrNull(row.circuit_image),
      circuitInfoUrl: stringOrNull(row.circuit_info_url),
    });
  }
  return byKey;
};

/**
 * Sessions rarely change once published, and there are only ~130 in a
 * season, so every sync is a full replay: fetch the season's sessions,
 * join meeting metadata, yield one page. Declaring replayWindowStart at
 * the season's start scopes the host's sweep to this year, so a cancelled
 * or removed session is tombstoned without touching other years.
 */
async function* syncSeason(
  ctx: SyncContext<OpenF1Config>,
): AsyncGenerator<SyncOp[], SyncStreamResult> {
  const year = currentYear(ctx.now());
  const meetings = await loadMeetings(ctx, year);
  const sessions = await getRows(ctx.fetch, `sessions?year=${year}`);
  const ops: SyncOp[] = [];
  for (const session of sessions) {
    const meetingKey = session.meeting_key;
    const meeting =
      typeof meetingKey === "number" ? meetings.get(meetingKey) : undefined;
    const op = mapSession(session, meeting);
    if (op !== null) {
      ops.push(op);
    }
  }
  ctx.log(`${ops.length} sessions for ${year}`);
  yield ops;
  const replayWindowStart = Date.UTC(year, 0, 1);
  return { replayWindowStart };
}

export const openf1Connector = defineConnector<OpenF1Config>({
  manifest: {
    id: "f1",
    version: "0.1.0",
    protocolVersion: PROTOCOL_VERSION,
    capabilities: ["poll"],
    produces: [
      { kind: F1_SESSION_KIND, schemaVersion: F1_SESSION_SCHEMA_VERSION },
    ],
  },
  auth: { kind: "none" },
  configSchema: openf1ConfigSchema,
  // No OIDC identity for a public source; connectLocal keys the connection
  // by connectorId, so identify is never called on this path.
  identify: () => null,
  discoverStreams: () => Promise.resolve([SEASON_STREAM]),
  sync: (ctx) => syncSeason(ctx),
});
