// What the progress web surfaces need from the host: the module's own
// server procedures, wired up by the app registry. Mirrors TasksApi; this
// module never imports the tRPC client or @halero/db, it only consumes
// this seam.

import type { HeatmapRange, HeatmapView, ProgressStatus } from "../contract";

export interface RefreshResult {
  readonly lastSyncedAt: number;
  readonly sources: readonly {
    readonly id: string;
    readonly syncedDays: number;
    readonly total: number;
    readonly error: string | null;
  }[];
}

export interface ProgressApi {
  readonly status: () => Promise<ProgressStatus>;
  /** `source` omitted (or "all") gives the merged heatmap. */
  readonly heatmap: (
    range: HeatmapRange,
    source?: string,
  ) => Promise<HeatmapView>;
  readonly refresh: () => Promise<RefreshResult>;
}
