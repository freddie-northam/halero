// Timezone arithmetic built on Intl only (no timezone dependencies).
// Lives in the SDK because connectors need it to map all-day items to
// home-timezone spine bounds, and hosts need the same math for day
// grouping; keeping one copy keeps the two in agreement.

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
const TIME_OF_DAY_PATTERN = /^\d{2}:\d{2}$/;

/** "YYYY-MM-DDTHH:MM" wall clock, comparable lexically like a date string. */
const wallDateTimeInZone = (epochMs: number, timeZone: string): string => {
  const wall = wallClockAt(timeZone, epochMs);
  const month = String(wall.month).padStart(2, "0");
  const day = String(wall.day).padStart(2, "0");
  const hour = String(wall.hour).padStart(2, "0");
  const minute = String(wall.minute).padStart(2, "0");
  return `${wall.year}-${month}-${day}T${hour}:${minute}`;
};

const wallTarget = (dateString: string, hour: number, minute: number): string =>
  `${dateString}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

/**
 * First instant at or after `from` whose local wall clock reaches the
 * requested date and time. Coarse forward scan, then a minute-level snap
 * back to the exact boundary (real timezone transitions sit on whole
 * minutes). Generalizes what used to be a date-only scan so any wall
 * time, not only midnight, resolves the same way across a DST gap.
 */
const firstInstantAtOrAfter = (
  from: number,
  target: string,
  timeZone: string,
): number => {
  let cursor = from;
  const limit = from + SCAN_LIMIT_MS;
  while (wallDateTimeInZone(cursor, timeZone) < target && cursor < limit) {
    cursor += SCAN_STEP_MS;
  }
  while (
    cursor - MINUTE_MS >= from &&
    wallDateTimeInZone(cursor - MINUTE_MS, timeZone) >= target
  ) {
    cursor -= MINUTE_MS;
  }
  return cursor;
};

/**
 * Epoch ms of the given wall-clock date and time in the zone, or the end
 * of a spring-forward gap when that exact wall time does not exist
 * (America/Santiago and Atlantic/Azores can gap across midnight; other
 * zones can gap at other hours). The two passes apply two different
 * offset assumptions to the same naive guess; when they disagree with
 * reality it is because the guess sits inside a gap, so the result is
 * verified against the requested wall clock and, on a mismatch, the
 * EARLIER of the two passes is used as the scan anchor (never the
 * later one: a gapped time's second pass can land on the far side of
 * the gap, an overshoot a forward-only scan could never correct).
 *
 * startOfDayInZone and instantInZone both fall through here (0,0 is the
 * midnight case) so they can never drift out of agreement.
 */
const wallInstantInZone = (
  dateString: string,
  hour: number,
  minute: number,
  timeZone: string,
): number => {
  const utcGuess =
    parseDateString(dateString) + hour * 3_600_000 + minute * MINUTE_MS;
  const firstPass = utcGuess - zoneOffsetAt(timeZone, utcGuess);
  const secondPass = utcGuess - zoneOffsetAt(timeZone, firstPass);
  const target = wallTarget(dateString, hour, minute);
  if (wallDateTimeInZone(secondPass, timeZone) === target) {
    return secondPass;
  }
  return firstInstantAtOrAfter(
    Math.min(firstPass, secondPass),
    target,
    timeZone,
  );
};

/**
 * Epoch ms of the first instant of the given calendar date in the zone:
 * local midnight, or the end of the spring-forward gap in zones whose
 * transition crosses midnight (America/Santiago, Atlantic/Azores) where
 * 00:00 does not exist.
 */
export const startOfDayInZone = (
  dateString: string,
  timeZone: string,
): number => wallInstantInZone(dateString, 0, 0, timeZone);

/**
 * Epoch ms of the given wall-clock time ("HH:MM", 24h) on the given date
 * in the zone; the timed-event analogue of startOfDayInZone. Falls into
 * a spring-forward gap the same way startOfDayInZone does: snapped
 * forward to the first valid instant at or after the requested time.
 */
export const instantInZone = (
  dateString: string,
  timeOfDay: string,
  timeZone: string,
): number => {
  if (!TIME_OF_DAY_PATTERN.test(timeOfDay)) {
    throw new Error(
      `"${timeOfDay}" is not a time of day; expected HH:MM (24h).`,
    );
  }
  const [hourText, minuteText] = timeOfDay.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) {
    throw new Error(
      `"${timeOfDay}" is not a time of day; expected HH:MM (24h).`,
    );
  }
  return wallInstantInZone(dateString, hour, minute, timeZone);
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
