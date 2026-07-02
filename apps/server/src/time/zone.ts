// Timezone arithmetic built on Intl only (no timezone dependencies).
// Used for all-day event bounds and agenda day grouping, always in the
// instance's home timezone.

const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface DayBounds {
  /** Epoch ms of local midnight at the start of the day. */
  readonly start: number;
  /** Epoch ms of the NEXT local midnight; exclusive. */
  readonly end: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

const partsFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const cached = partsFormatterCache.get(timeZone);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  partsFormatterCache.set(timeZone, formatter);
  return formatter;
};

interface WallClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const wallClockAt = (timeZone: string, epochMs: number): WallClock => {
  const fields: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(epochMs)) {
    if (part.type !== "literal") {
      fields[part.type] = Number(part.value);
    }
  }
  return {
    year: fields.year ?? 0,
    month: fields.month ?? 1,
    day: fields.day ?? 1,
    hour: fields.hour ?? 0,
    minute: fields.minute ?? 0,
    second: fields.second ?? 0,
  };
};

/** Zone offset (ms east of UTC) in effect at the given instant. */
const zoneOffsetAt = (timeZone: string, epochMs: number): number => {
  const wall = wallClockAt(timeZone, epochMs);
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  // Compare at whole-second precision; formatToParts drops milliseconds.
  return asUtc - (epochMs - (((epochMs % 1000) + 1000) % 1000));
};

const parseDateString = (dateString: string): number => {
  if (!DATE_STRING_PATTERN.test(dateString)) {
    throw new Error(
      `"${dateString}" is not a calendar date; expected YYYY-MM-DD.`,
    );
  }
  return Date.parse(`${dateString}T00:00:00Z`);
};

const MINUTE_MS = 60_000;
const SCAN_STEP_MS = 30 * MINUTE_MS;
const SCAN_LIMIT_MS = 48 * 3_600_000;

/**
 * First instant at or after `from` whose local calendar date reaches the
 * requested date. Coarse forward scan, then a minute-level snap back to
 * the exact boundary (real timezone transitions sit on whole minutes).
 */
const firstInstantOfDate = (
  from: number,
  dateString: string,
  timeZone: string,
): number => {
  let cursor = from;
  const limit = from + SCAN_LIMIT_MS;
  while (dateStringInZone(cursor, timeZone) < dateString && cursor < limit) {
    cursor += SCAN_STEP_MS;
  }
  while (
    cursor - MINUTE_MS >= from &&
    dateStringInZone(cursor - MINUTE_MS, timeZone) >= dateString
  ) {
    cursor -= MINUTE_MS;
  }
  return cursor;
};

/**
 * Epoch ms of the first instant of the given calendar date in the zone:
 * local midnight, or the end of the spring-forward gap in zones whose
 * transition crosses midnight (America/Santiago, Atlantic/Azores) where
 * 00:00 does not exist. The two-pass offset resolution alone would land
 * such days one hour into the PREVIOUS local day, so the result is
 * verified against the requested date and advanced across the gap.
 */
export const startOfDayInZone = (
  dateString: string,
  timeZone: string,
): number => {
  const utcGuess = parseDateString(dateString);
  const firstPass = utcGuess - zoneOffsetAt(timeZone, utcGuess);
  const secondPass = utcGuess - zoneOffsetAt(timeZone, firstPass);
  if (dateStringInZone(secondPass, timeZone) >= dateString) {
    return secondPass;
  }
  return firstInstantOfDate(secondPass, dateString, timeZone);
};

/** Local-midnight-to-next-local-midnight window; 23 to 25 hours over DST. */
export const dayBoundsInZone = (
  dateString: string,
  timeZone: string,
): DayBounds => ({
  start: startOfDayInZone(dateString, timeZone),
  end: startOfDayInZone(addDaysToDateString(dateString, 1), timeZone),
});

/** The calendar date ("YYYY-MM-DD") an instant falls on in the zone. */
export const dateStringInZone = (epochMs: number, timeZone: string): string => {
  const wall = wallClockAt(timeZone, epochMs);
  const month = String(wall.month).padStart(2, "0");
  const day = String(wall.day).padStart(2, "0");
  return `${wall.year}-${month}-${day}`;
};

/** Pure calendar arithmetic; no timezone involved. */
export const addDaysToDateString = (
  dateString: string,
  days: number,
): string => {
  const base = parseDateString(dateString);
  const shifted = new Date(base + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
};
