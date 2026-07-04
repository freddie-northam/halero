// Pure, stable sorting for the list view's client-side table. No
// rendering, timezone, or React state here: ListView owns the toggle
// interaction and hands the current sort state to `sortEvents`.

import type { AgendaEvent } from "../../contract";

export type SortColumn = "start" | "title" | "location";
export type SortDirection = "asc" | "desc";

export interface SortState {
  readonly column: SortColumn;
  readonly direction: SortDirection;
}

export const DEFAULT_SORT: SortState = { column: "start", direction: "asc" };

/**
 * Ascending comparators for the two plain columns. Multiplying the
 * result by +/-1 (rather than sorting ascending then reversing the whole
 * array) keeps ties at 0 regardless of direction, so
 * Array.prototype.sort's stability holds for descending order too: equal
 * keys keep their original relative order instead of swapping places.
 */
const compareByColumn = (
  column: "start" | "title",
): ((a: AgendaEvent, b: AgendaEvent) => number) =>
  column === "start"
    ? (a, b) => a.start - b.start
    : (a, b) => a.title.localeCompare(b.title);

const hasLocation = (
  event: AgendaEvent,
): event is AgendaEvent & { location: string } => event.location !== null;

/**
 * Location-less events always sort to the bottom, in both directions:
 * only the located events get reordered by the comparator, and the
 * unlocated ones keep their original relative order appended after them.
 */
const sortByLocation = (
  events: readonly AgendaEvent[],
  multiplier: 1 | -1,
): readonly AgendaEvent[] => {
  const located = events.filter(hasLocation);
  const unlocated = events.filter((event) => !hasLocation(event));
  const sorted = located
    .slice()
    .sort((a, b) => a.location.localeCompare(b.location) * multiplier);
  return [...sorted, ...unlocated];
};

/** Sorts a copy of `events`; the input array is never mutated. */
export const sortEvents = (
  events: readonly AgendaEvent[],
  sort: SortState,
): readonly AgendaEvent[] => {
  const multiplier = sort.direction === "asc" ? 1 : -1;
  if (sort.column === "location") {
    return sortByLocation(events, multiplier);
  }
  const compare = compareByColumn(sort.column);
  return events.slice().sort((a, b) => compare(a, b) * multiplier);
};
