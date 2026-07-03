// Strips the server's search-highlight markers so they never render.
// Raycast Lists draw plain text only, so unlike the web app there is
// nothing to emphasize: every marker is simply removed.

// Pinned to @halero/core's HIGHLIGHT_START/HIGHLIGHT_END
// (packages/core/src/search.ts). The extension must not import
// @halero/core at runtime, so the values are redeclared here; the
// server's search payload contract guarantees them (the
// apps/web/src/lib/highlight.ts precedent).
const HIGHLIGHT_START = "\u0001";
const HIGHLIGHT_END = "\u0002";

// The markers are control characters with no regex meaning, so they
// interpolate verbatim. Stray unpaired markers in poisoned content are
// stripped just the same: no marker byte may ever reach a List row.
const MARKERS = new RegExp(`[${HIGHLIGHT_START}${HIGHLIGHT_END}]`, "gu");

/** Highlight() output reduced to plain text safe for Raycast rows. */
export const stripHighlightMarkers = (text: string): string =>
  text.replaceAll(MARKERS, "");
