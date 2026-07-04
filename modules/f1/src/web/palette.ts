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
};

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
