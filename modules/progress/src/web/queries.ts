// The module's react-query keys and the invalidation wrapper the host
// registry applies to its ProgressApi. The keys never leave this module:
// the host holds the QueryClient and calls the wrapper, so core code never
// learns (or hardcodes) module cache shapes.

import type { QueryClient } from "@tanstack/react-query";
import type { HeatmapRange } from "../contract";
import type { ProgressApi } from "./api";

export const progressRootKey = ["progress"] as const;

export const progressStatusKey = [...progressRootKey, "status"] as const;

/** Prefix over the four live GitHub reads, for a scoped Work-tab refresh. */
export const progressWorkRootKey = [...progressRootKey, "work"] as const;

export const progressHeatmapKey = (range: HeatmapRange, source: string) =>
  [...progressRootKey, "heatmap", source, range] as const;

export const progressSummaryKey = (range: HeatmapRange) =>
  [...progressRootKey, "summary", range] as const;

/** kind: "reviews" | "prs" | "issues" | "repos" (the live GitHub reads). */
export const progressWorkKey = (kind: string) =>
  [...progressRootKey, "work", kind] as const;

/**
 * Wraps a ProgressApi so a successful refresh invalidates the module's
 * queries (status, heatmaps, summary) and resolves only after active ones
 * refetch. Reads pass straight through; only refresh mutates the world.
 */
export const withProgressInvalidation = (
  api: ProgressApi,
  queryClient: QueryClient,
): ProgressApi => ({
  ...api,
  refresh: async () => {
    const result = await api.refresh();
    await queryClient.invalidateQueries({ queryKey: progressRootKey });
    return result;
  },
});
