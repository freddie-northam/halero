// The progress module's own API contract: the shapes its server router
// returns and its web page consumes. Pure types so both entries can
// import them without dragging the other side's dependencies along.

/** The GitHub connection's health for the Progress page. */
export interface ProgressStatus {
  readonly connected: boolean;
  readonly login: string | null;
  /** Epoch ms of the last successful sync, or null when never synced. */
  readonly lastSyncedAt: number | null;
  /** The last sync failure's readable message, or null when healthy. */
  readonly lastError: string | null;
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
