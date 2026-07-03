// Pure lane-packing for the week grid's side-by-side timed events. No
// rendering, timezone, or DOM concerns here: callers hand in start/end
// epoch (or any comparable numeric) pairs and get back which lane each
// one occupies.

export interface PackedSlot {
  readonly lane: number;
  readonly laneCount: number;
}

/**
 * Assigns each event a lane so overlapping events render side by side.
 * Two events overlap iff `aStart < bEnd && bStart < aEnd`; touching
 * end-to-start does not count as an overlap.
 *
 * Events are sorted by start (a copy of the index list, so the input
 * order and array are never mutated), then grouped into connected
 * overlap clusters: a run of events where each one's start falls before
 * the running max end seen so far in the run. Within each cluster, a
 * greedy sweep assigns every event the first lane whose previous
 * occupant already ended at or before that event's start, which is the
 * standard interval-graph-coloring result: the number of lanes a cluster
 * ends up using equals its true concurrent-overlap high-water mark. Every
 * event in a cluster reports that cluster's total lane count.
 *
 * Returns one PackedSlot per input event, in input order.
 */
interface TimeSpan {
  readonly start: number;
  readonly end: number;
}

/** An event paired with its position in the caller's original array. */
interface IndexedSpan {
  readonly span: TimeSpan;
  readonly index: number;
}

export const packEventLanes = (
  events: readonly TimeSpan[],
): readonly PackedSlot[] => {
  const sorted: IndexedSpan[] = events
    .map((span, index) => ({ span, index }))
    .sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);

  const clusters: IndexedSpan[][] = [];
  let clusterEnd = -Infinity;
  for (const entry of sorted) {
    const lastCluster = clusters[clusters.length - 1];
    if (lastCluster === undefined || entry.span.start >= clusterEnd) {
      clusters.push([entry]);
      clusterEnd = entry.span.end;
    } else {
      lastCluster.push(entry);
      clusterEnd = Math.max(clusterEnd, entry.span.end);
    }
  }

  const result = new Array<PackedSlot>(events.length);
  for (const cluster of clusters) {
    const laneEnds: number[] = [];
    const lanes: number[] = [];
    for (const entry of cluster) {
      const freeLane = laneEnds.findIndex((end) => end <= entry.span.start);
      const lane = freeLane === -1 ? laneEnds.length : freeLane;
      laneEnds[lane] = entry.span.end;
      lanes.push(lane);
    }
    const laneCount = laneEnds.length;
    cluster.forEach((entry, position) => {
      result[entry.index] = { lane: lanes[position] ?? 0, laneCount };
    });
  }
  return result;
};
