// Pure shaping for the Search Halero command: the client-side query
// cap, relevance-order grouping, and marker-safe titles.

import { stripHighlightMarkers } from "./highlight";

// Pinned to the server's searchInput cap
// (apps/server/src/trpc/system-router.ts): longer queries are rejected
// there, so the command truncates instead of erroring mid-keystroke.
export const SEARCH_QUERY_MAX_LENGTH = 200;

export const truncateSearchQuery = (raw: string): string =>
  raw.trim().slice(0, SEARCH_QUERY_MAX_LENGTH);

export interface KindGroup<T> {
  readonly kind: string;
  readonly hits: readonly T[];
}

/** Groups hits by kind in first-appearance (relevance) order, the same
 * way the web command palette sections its results. */
export const groupByKind = <T extends { readonly kind: string }>(
  hits: readonly T[],
): readonly KindGroup<T>[] => {
  const groups = new Map<string, T[]>();
  for (const hit of hits) {
    const bucket = groups.get(hit.kind) ?? [];
    bucket.push(hit);
    groups.set(hit.kind, bucket);
  }
  return [...groups.entries()].map(([kind, grouped]) => ({
    kind,
    hits: grouped,
  }));
};

interface TitledHit {
  readonly title: string | null;
  readonly titleHighlighted: string;
}

/** Plain row title: highlighted title with markers stripped, falling
 * back to the raw spine title, then to a fixed placeholder. */
export const displayTitle = (hit: TitledHit): string => {
  const stripped = stripHighlightMarkers(hit.titleHighlighted);
  if (stripped !== "") {
    return stripped;
  }
  if (hit.title !== null && hit.title !== "") {
    return hit.title;
  }
  return "Untitled";
};
