// Fetching and shaping OpenF1 live data. Reads use the bearer token; the
// merge functions are pure so they can be unit-tested with fixtures (the
// authenticated live feed cannot be replayed in tests).

import type { FetchLike } from "@halero/connector-sdk";
import type { LiveSession, TimingRow } from "@halero/module-f1/server";

export const OPENF1_LIVE_BASE = "https://api.openf1.org/v1";

const UNREACHABLE_MESSAGE =
  "Halero could not reach OpenF1 for live data. Try again in a moment.";
const EXPIRED_MESSAGE =
  "Your OpenF1 live-timing session expired. Reconnect live timing in " +
  "Settings.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** GETs a live endpoint with the bearer token. 401 means the token died. */
export const fetchLiveRows = async (
  fetchImpl: FetchLike,
  token: string,
  path: string,
): Promise<readonly Record<string, unknown>[]> => {
  const response = await fetchImpl(`${OPENF1_LIVE_BASE}/${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  }).catch(() => null);
  if (response === null) {
    throw new Error(UNREACHABLE_MESSAGE);
  }
  if (response.status === 401) {
    throw new Error(EXPIRED_MESSAGE);
  }
  if (!response.ok) {
    return [];
  }
  const body: unknown = await response.json().catch(() => null);
  return Array.isArray(body) ? body.filter(isRecord) : [];
};

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const str = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const gap = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `+${value.toFixed(3)}`;
  }
  return typeof value === "string" ? value : null;
};

/** Keeps the last row per driver from a time series ordered by date. */
const lastPerDriver = (
  rows: readonly Record<string, unknown>[],
): Map<number, Record<string, unknown>> => {
  const byDriver = new Map<number, Record<string, unknown>>();
  for (const row of rows) {
    const driver = num(row.driver_number);
    if (driver === null) {
      continue;
    }
    // Rows arrive oldest-first, so a later row overwrites an earlier one and
    // the map ends up holding each driver's most recent sample.
    byDriver.set(driver, row);
  }
  return byDriver;
};

/** The current stint per driver: the one with the highest lap_start. */
const currentStint = (
  rows: readonly Record<string, unknown>[],
): Map<number, Record<string, unknown>> => {
  const byDriver = new Map<number, Record<string, unknown>>();
  for (const row of rows) {
    const driver = num(row.driver_number);
    if (driver === null) {
      continue;
    }
    const existing = byDriver.get(driver);
    const existingStart =
      existing === undefined ? -1 : (num(existing.lap_start) ?? -1);
    if ((num(row.lap_start) ?? -1) >= existingStart) {
      byDriver.set(driver, row);
    }
  }
  return byDriver;
};

/**
 * Merges the live series into timing-tower rows, sorted by current
 * position. Pure: given the four endpoint payloads it computes the tower.
 */
export const buildTimingRows = (
  driversRows: readonly Record<string, unknown>[],
  positionRows: readonly Record<string, unknown>[],
  intervalRows: readonly Record<string, unknown>[],
  stintRows: readonly Record<string, unknown>[],
): TimingRow[] => {
  const positions = lastPerDriver(positionRows);
  const intervals = lastPerDriver(intervalRows);
  const stints = currentStint(stintRows);

  const rows: TimingRow[] = [];
  for (const driverRow of driversRows) {
    const driverNumber = num(driverRow.driver_number);
    if (driverNumber === null) {
      continue;
    }
    const position = positions.get(driverNumber);
    const interval = intervals.get(driverNumber);
    const stint = stints.get(driverNumber);
    rows.push({
      position: position === undefined ? null : num(position.position),
      driverNumber,
      nameAcronym: str(driverRow.name_acronym),
      fullName: str(driverRow.full_name),
      teamName: str(driverRow.team_name),
      teamColour: str(driverRow.team_colour),
      gapToLeader: interval === undefined ? null : gap(interval.gap_to_leader),
      interval: interval === undefined ? null : gap(interval.interval),
      compound: stint === undefined ? null : str(stint.compound),
      tyreAge: stint === undefined ? null : num(stint.tyre_age_at_start),
      lastLap: null,
    });
  }
  return rows.sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
};

/** Shapes a `sessions?session_key=latest` row into the live-session header. */
export const buildLiveSession = (
  row: Record<string, unknown> | undefined,
  now: number,
): LiveSession | null => {
  if (row === undefined) {
    return null;
  }
  const sessionKey = num(row.session_key);
  if (sessionKey === null) {
    return null;
  }
  const dateStart = str(row.date_start);
  const dateEnd = str(row.date_end);
  const startMs = dateStart === null ? null : Date.parse(dateStart);
  const endMs = dateEnd === null ? null : Date.parse(dateEnd);
  const isLive =
    startMs !== null &&
    !Number.isNaN(startMs) &&
    now >= startMs &&
    (endMs === null || Number.isNaN(endMs) || now <= endMs);
  return {
    sessionKey,
    sessionName: str(row.session_name) ?? "Session",
    sessionType: str(row.session_type) ?? "",
    meetingName: str(row.meeting_name),
    countryName: str(row.country_name),
    countryFlagUrl: str(row.country_flag),
    circuitShortName: str(row.circuit_short_name),
    dateStart,
    dateEnd,
    isLive,
  };
};
