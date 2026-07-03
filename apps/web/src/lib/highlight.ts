// Renders the server's search highlighting safely. This is a security
// boundary: stored content can contain raw marker bytes and the server
// passes them through highlight() verbatim, so the split below must
// never let poisoned content fabricate or shift a highlight region.

// Pinned to @halero/core's HIGHLIGHT_START/HIGHLIGHT_END
// (packages/core/src/search.ts). The web app must not import
// @halero/core at runtime, so the values are redeclared here; the
// server's search payload contract guarantees them.
export const HIGHLIGHT_START = "\u0001";
export const HIGHLIGHT_END = "\u0002";

/**
 * A highlight region is exactly a start marker, marker-free text, and
 * an end marker; anything looser would let a stray marker open or close
 * a region across attacker-controlled text. The markers are control
 * characters with no regex meaning, so they interpolate verbatim.
 */
const REGION = new RegExp(
  `${HIGHLIGHT_START}([^${HIGHLIGHT_START}${HIGHLIGHT_END}]*)${HIGHLIGHT_END}`,
  "gu",
);

const MARKERS = new RegExp(`[${HIGHLIGHT_START}${HIGHLIGHT_END}]`, "gu");

/** Strips stray markers so they never reach the DOM as text. */
const stripMarkers = (text: string): string => text.replaceAll(MARKERS, "");

export interface HighlightSegment {
  readonly text: string;
  /** True for text inside a well-formed marker pair: render as <mark>. */
  readonly highlighted: boolean;
}

/**
 * Splits highlight() output into renderable segments. Only well-formed
 * marker pairs become highlighted segments; stray markers are stripped
 * from the surrounding text first, so they can never fabricate a region
 * (see the poisoned-content tests).
 */
export const splitHighlighted = (
  value: string,
): readonly HighlightSegment[] => {
  const segments: HighlightSegment[] = [];
  const push = (text: string, highlighted: boolean): void => {
    if (text !== "") {
      segments.push({ text, highlighted });
    }
  };
  let cursor = 0;
  for (const match of value.matchAll(REGION)) {
    push(stripMarkers(value.slice(cursor, match.index)), false);
    push(match[1] ?? "", true);
    cursor = match.index + match[0].length;
  }
  push(stripMarkers(value.slice(cursor)), false);
  return segments;
};
