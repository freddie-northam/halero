// The progress module's own API contract: the shapes its server router
// returns and its web page consumes. Pure types so both entries can
// import them without dragging the other side's dependencies along.

/** One activity source's health for the Progress page's source selector. */
export interface SourceStatus {
  readonly id: string;
  readonly displayName: string;
  readonly connected: boolean;
  /** Epoch ms of the last refresh, or null when never refreshed. */
  readonly lastSyncedAt: number | null;
  /** The last refresh failure's readable message, or null when healthy. */
  readonly lastError: string | null;
}

/** Every activity source and whether it is connected. */
export interface ProgressStatus {
  readonly sources: readonly SourceStatus[];
}

/** How much history the heatmap covers. */
export type HeatmapRange = "year" | "6months" | "month";

/** One densified day in the heatmap: its date and contribution count. */
export interface HeatmapDay {
  /** Calendar date ("YYYY-MM-DD"). */
  readonly date: string;
  readonly count: number;
}

/** A full heatmap window: bounds, the densified days, and headline stats. */
export interface HeatmapView {
  /** The source this heatmap is for, or "all" for the merged view. */
  readonly source: string;
  /** Inclusive first date of the window ("YYYY-MM-DD"). */
  readonly from: string;
  /** Inclusive last date of the window ("YYYY-MM-DD"). */
  readonly to: string;
  /** The home-timezone date of now ("YYYY-MM-DD"). */
  readonly today: string;
  /** Ascending, gap-free day list from `from` to `to`. */
  readonly days: readonly HeatmapDay[];
  readonly total: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
}
