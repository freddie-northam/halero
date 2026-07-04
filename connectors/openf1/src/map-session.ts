// Pure mapping from an OpenF1 session row (joined with its meeting) to a
// SyncOp the host stores as an f1.session spine entity + satellite. No I/O.

import { stringOrNull, type UpsertSyncOp } from "@halero/connector-sdk";
import { F1_SESSION_KIND, type F1SessionSatellite } from "@halero/schemas";

/** Bumped when the f1.session satellite shape changes incompatibly. */
export const F1_SESSION_SCHEMA_VERSION = 1;

const numOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const boolValue = (value: unknown): boolean => value === true;

const msOrUndefined = (iso: string | null): number | undefined => {
  if (iso === null) {
    return undefined;
  }
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
};

/** Meeting fields the schedule cards render without a second lookup. */
export interface MeetingInfo {
  readonly meetingName: string | null;
  readonly countryFlagUrl: string | null;
  readonly circuitImageUrl: string | null;
  readonly circuitInfoUrl: string | null;
}

/**
 * Builds an upsert for one session. Returns null when the row lacks the
 * keys an entity needs (session_key + meeting_key). The version marker
 * folds the mutable fields (dates, cancellation) so a rescheduled or
 * cancelled session re-syncs but an unchanged one short-circuits.
 */
export const mapSession = (
  session: Record<string, unknown>,
  meeting: MeetingInfo | undefined,
): UpsertSyncOp | null => {
  const sessionKey = numOrNull(session.session_key);
  const meetingKey = numOrNull(session.meeting_key);
  const year = numOrNull(session.year);
  const sessionName = stringOrNull(session.session_name);
  const sessionType = stringOrNull(session.session_type);
  if (
    sessionKey === null ||
    meetingKey === null ||
    year === null ||
    sessionName === null ||
    sessionType === null
  ) {
    return null;
  }

  const dateStart = stringOrNull(session.date_start);
  const dateEnd = stringOrNull(session.date_end);
  const countryName = stringOrNull(session.country_name);
  const meetingName = meeting?.meetingName ?? null;
  const isCancelled = boolValue(session.is_cancelled);

  const satellite: F1SessionSatellite = {
    sessionKey,
    meetingKey,
    sessionName,
    sessionType,
    year,
    dateStart,
    dateEnd,
    gmtOffset: stringOrNull(session.gmt_offset),
    circuitKey: numOrNull(session.circuit_key),
    circuitShortName: stringOrNull(session.circuit_short_name),
    countryName,
    countryCode: stringOrNull(session.country_code),
    location: stringOrNull(session.location),
    meetingName,
    countryFlagUrl: meeting?.countryFlagUrl ?? null,
    circuitImageUrl: meeting?.circuitImageUrl ?? null,
    circuitInfoUrl: meeting?.circuitInfoUrl ?? null,
    isCancelled,
  };

  const eventName = meetingName ?? countryName ?? "Formula 1";
  const title = `${eventName} — ${sessionName}`;
  const snippetParts = [
    stringOrNull(session.circuit_short_name),
    countryName,
  ].filter((part): part is string => part !== null);

  return {
    op: "upsert",
    externalId: String(sessionKey),
    version: `${dateStart ?? ""}|${dateEnd ?? ""}|${isCancelled ? 1 : 0}`,
    spine: {
      kind: F1_SESSION_KIND,
      schemaVersion: F1_SESSION_SCHEMA_VERSION,
      title,
      ...(snippetParts.length > 0 ? { snippet: snippetParts.join(" · ") } : {}),
      ...(msOrUndefined(dateStart) === undefined
        ? {}
        : { occurredStart: msOrUndefined(dateStart) }),
      ...(msOrUndefined(dateEnd) === undefined
        ? {}
        : { occurredEnd: msOrUndefined(dateEnd) }),
    },
    satellite,
    raw: session,
  };
};
