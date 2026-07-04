// What the progress web surfaces need from the host: the module's own
// server procedures, wired up by the app registry. Mirrors TasksApi; this
// module never imports the tRPC client or @halero/db, it only consumes
// this seam.

import type {
  DeveloperSummary,
  HeatmapRange,
  HeatmapView,
  ProgressStatus,
  PullRequestItem,
  RepoStat,
  WorkItem,
  WorkList,
} from "../contract";

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
  /**
   * `source` omitted (or "all") gives the merged heatmap; `category` narrows
   * the merged view to one catalog category (the Developer page passes
   * "developer").
   */
  readonly heatmap: (
    range: HeatmapRange,
    source?: string,
    category?: string,
  ) => Promise<HeatmapView>;
  readonly refresh: () => Promise<RefreshResult>;
  // Developer Work tab (live GitHub reads).
  readonly reviewRequests: () => Promise<WorkList<WorkItem>>;
  readonly myOpenPullRequests: () => Promise<WorkList<PullRequestItem>>;
  readonly assignedIssues: () => Promise<WorkList<WorkItem>>;
  readonly repositories: () => Promise<WorkList<RepoStat>>;
  // Developer Activity tab.
  readonly summary: (range: HeatmapRange) => Promise<DeveloperSummary>;
}
