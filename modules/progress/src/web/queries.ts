// The module's react-query keys and the invalidation wrapper the host
// registry applies to its ProgressApi. The keys never leave this module:
// the host holds the QueryClient and calls the wrapper, so core code never
// learns (or hardcodes) module cache shapes.

import type { QueryClient } from "@tanstack/react-query";
import type { HeatmapRange } from "../contract";
import type { ProgressApi } from "./api";

const progressRootKey = ["progress"] as const;

export const progressStatusKey = [...progressRootKey, "status"] as const;

export const progressHeatmapKey = (range: HeatmapRange, source: string) =>
  [...progressRootKey, "heatmap", source, range] as const;

/**
 * Wraps a ProgressApi so a successful refresh invalidates the module's
 * queries (status and the heatmap under every range) and resolves only
 * after active ones refetched. Reads pass straight through; only refresh
 * mutates the world, so it is the only method that invalidates.
 */
export const withProgressInvalidation = (
  api: ProgressApi,
  queryClient: QueryClient,
): ProgressApi => ({
  status: api.status,
  heatmap: api.heatmap,
  refresh: async () => {
    const result = await api.refresh();
    await queryClient.invalidateQueries({ queryKey: progressRootKey });
    return result;
  },
});
