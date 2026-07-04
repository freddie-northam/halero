// Pure presentation helpers shared across the F1 widgets: tyre and team
// colours, session-state pills, and timezone-aware time formatting. Kept
// free of React and side effects so each helper is trivially testable.

import type { SessionState } from "../contract";

/** OpenF1 tyre compound colours, keyed by the compound's upper-case name. */
export const TYRE_COLOURS: Readonly<Record<string, string>> = {
  SOFT: "#DA291C",
  MEDIUM: "#FFD12E",
  HARD: "#EBEBEB",
  INTERMEDIATE: "#43B02A",
  WET: "#0067AD",
  // Historic/test compounds still appear in some OpenF1 datasets.
  HYPERSOFT: "#FEB1C1",
  ULTRASOFT: "#B24BA7",
  SUPERSOFT: "#DA291C",
  SUPERHARD: "#F97350",
  UNKNOWN: "#6b7280",
};

/** Neutral fallback (Tailwind gray-500) for an absent tyre or flag colour. */
const NEUTRAL_HEX = "#6b7280";

/** A tyre compound's brand colour, neutral grey when absent or unknown. */
export const tyreColour = (compound: string | null): string => {
  if (compound === null) {
    return NEUTRAL_HEX;
  }
  return TYRE_COLOURS[compound.trim().toUpperCase()] ?? NEUTRAL_HEX;
};

/**
 * Race-control flag colours, keyed by OpenF1's upper-case flag string.
 * DOUBLE YELLOW is a distinct, deeper amber; CLEAR and CHEQUERED get
 * neutral treatments so the coloured flags stand out on the timeline.
 */
export const FLAG_COLOURS: Readonly<Record<string, string>> = {
  GREEN: "#43B02A",
  YELLOW: "#FFD12E",
  "DOUBLE YELLOW": "#E8A500",
  RED: "#DA291C",
  BLUE: "#0067AD",
  CHEQUERED: "#111111",
  CLEAR: "#9ca3af",
  "SAFETY CAR": "#F97350",
};

/** A race-control marker colour: matches the flag, or a neutral default. */
export const flagColour = (flag: string | null): string => {
  if (flag === null) {
    return NEUTRAL_HEX;
  }
  return FLAG_COLOURS[flag.trim().toUpperCase()] ?? NEUTRAL_HEX;
};

/**
 * A lap or sector time in seconds rendered as "m:ss.mmm" (or "ss.mmm"
 * under a minute). Returns a dash for a null/negative duration so table
 * columns stay aligned.
 */
export const formatLapTime = (seconds: number | null): string => {
  if (seconds === null || seconds < 0 || !Number.isFinite(seconds)) {
    return "-";
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  if (minutes === 0) {
    return rest.toFixed(3);
  }
  return `${minutes}:${rest.toFixed(3).padStart(6, "0")}`;
};

/** A duration in seconds rendered as a compact "12.345s" secs string. */
export const formatSeconds = (seconds: number | null): string =>
  seconds === null || !Number.isFinite(seconds)
    ? "-"
    : `${seconds.toFixed(3)}s`;

/** Neutral fallback (Tailwind gray-500) when a team has no colour on file. */
const NEUTRAL_COLOUR = "#6b7280";

/**
 * OpenF1's team_colour is a bare hex string with no leading '#'. Prefix
 * it into a valid CSS colour, falling back to a neutral grey for a null
 * or blank value so a swatch always renders something.
 */
export const teamColour = (hex: string | null): string => {
  if (hex === null) {
    return NEUTRAL_COLOUR;
  }
  const trimmed = hex.trim();
  if (trimmed === "") {
    return NEUTRAL_COLOUR;
  }
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
};

/** A session-state pill's label and Tailwind classes: live pulses coral. */
export const sessionStateBadge = (
  state: SessionState,
): { readonly label: string; readonly className: string } => {
  switch (state) {
    case "live":
      return {
        label: "Live",
        className:
          "animate-pulse border-transparent bg-[#DA291C] text-white dark:bg-[#DA291C]",
      };
    case "upcoming":
      return {
        label: "Upcoming",
        className: "border-transparent bg-accent text-accent-foreground",
      };
    case "done":
      return {
        label: "Done",
        className: "border-transparent bg-muted text-muted-foreground",
      };
  }
};

/**
 * The local clock time of an ISO instant in the given timezone, e.g.
 * "14:00". Returns an em-space placeholder (never an em dash) for a null
 * or unparseable instant so table columns stay aligned.
 */
export const formatSessionTime = (iso: string | null, tz: string): string => {
  const date = parseIso(iso);
  if (date === null) {
    return "--:--";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(date);
};

/**
 * The local calendar day of an ISO instant in the given timezone, e.g.
 * "Sun 6 Jul". Returns a placeholder for a null or unparseable instant.
 */
export const formatSessionDay = (iso: string | null, tz: string): string => {
  const date = parseIso(iso);
  if (date === null) {
    return "TBC";
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz,
  }).format(date);
};

/**
 * A classification gap for display: leader shows an em-space-free dash,
 * lapped strings ("+1 LAP") pass through, and a null gap (a DNF row,
 * handled by its own badge) shows nothing.
 */
export const formatGap = (gap: string | null): string => {
  if (gap === null) {
    return "";
  }
  const trimmed = gap.trim();
  return trimmed === "" ? "" : trimmed;
};

/** Parses an ISO instant into a Date, or null when absent or invalid. */
const parseIso = (iso: string | null): Date | null => {
  if (iso === null) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};
