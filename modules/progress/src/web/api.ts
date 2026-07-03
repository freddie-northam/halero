// What the progress web surfaces need from the host: the module's own
// server procedures, wired up by the app registry. Mirrors TasksApi; this
// module never imports the tRPC client or @halero/db, it only consumes
// this seam.

import type { HeatmapRange, HeatmapView, ProgressStatus } from "../contract";

export interface ProgressApi {
  readonly status: () => Promise<ProgressStatus>;
  readonly heatmap: (range: HeatmapRange) => Promise<HeatmapView>;
  readonly refresh: () => Promise<{
    readonly syncedDays: number;
    readonly total: number;
    readonly lastSyncedAt: number;
  }>;
}
