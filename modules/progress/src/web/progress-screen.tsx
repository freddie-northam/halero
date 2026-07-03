// The Progress page: a GitHub-style contribution heatmap fed entirely
// through the narrow ProgressApi seam (status + heatmap + refresh). No
// tRPC client and no @halero/db here, ever. The green ramp lives here
// because it is a GitHub detail; the grid itself stays source-agnostic.

import { Alert, AlertDescription, Button, Loader2, Skeleton } from "@halero/ui";
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useEffect, useRef, useState } from "react";
import type { HeatmapRange, HeatmapView, ProgressStatus } from "../contract";
import type { ProgressApi } from "./api";
import { HeatmapGrid } from "./components/heatmap-grid";
import { RangeToggle } from "./components/range-toggle";
import { StatsHeader } from "./components/stats-header";
import { progressHeatmapKey, progressStatusKey } from "./queries";
import { readableError } from "./readable-error";

// GitHub's contribution colours, empty -> max. Per-source on purpose: the
// grid takes any five-stop ramp, so other sources can pass their own.
const GITHUB_GREEN_RAMP = [
  "#ebedf0",
  "#9be9a8",
  "#40c463",
  "#30a14e",
  "#216e39",
] as const;

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

type RefreshResult = Awaited<ReturnType<ProgressApi["refresh"]>>;
type RefreshMutation = UseMutationResult<RefreshResult, Error, void, unknown>;

const isStale = (lastSyncedAt: number | null, now: number): boolean =>
  lastSyncedAt === null || now - lastSyncedAt > SIX_HOURS_MS;

/**
 * Fires a single refresh on mount when the last sync is missing or older
 * than six hours. The ref guard keeps it to one shot per page visit even as
 * the status query settles and re-renders.
 */
const useStaleRefresh = (
  status: ProgressStatus | undefined,
  refresh: RefreshMutation,
  now: () => number,
): void => {
  const triggered = useRef(false);
  useEffect(() => {
    if (triggered.current || status === undefined || !status.connected) {
      return;
    }
    if (!isStale(status.lastSyncedAt, now())) {
      return;
    }
    triggered.current = true;
    refresh.mutate();
  }, [status, refresh, now]);
};

const ErrorAlert = ({ error }: { readonly error: unknown }): ReactElement => (
  <Alert variant="destructive">
    <AlertDescription>{readableError(error)}</AlertDescription>
  </Alert>
);

const ConnectPrompt = (): ReactElement => (
  <div className="rounded-lg border border-dashed p-8 text-center">
    <h2 className="text-base font-semibold">Connect GitHub to see progress</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Link your GitHub account to build your contribution heatmap.{" "}
      <Link
        to="/settings/$section"
        params={{ section: "integrations" }}
        className="font-medium underline underline-offset-4 hover:text-foreground"
      >
        Open integrations
      </Link>
    </p>
  </div>
);

const HeatmapSection = ({
  heatmap,
  range,
}: {
  readonly heatmap: UseQueryResult<HeatmapView>;
  readonly range: HeatmapRange;
}): ReactElement => {
  if (heatmap.error !== null) {
    return <ErrorAlert error={heatmap.error} />;
  }
  if (heatmap.data === undefined) {
    return <Skeleton className="h-40 w-full" />;
  }
  return (
    <>
      <StatsHeader
        total={heatmap.data.total}
        currentStreak={heatmap.data.currentStreak}
        longestStreak={heatmap.data.longestStreak}
        range={range}
      />
      <HeatmapGrid days={heatmap.data.days} colorRamp={GITHUB_GREEN_RAMP} />
    </>
  );
};

const ConnectedView = ({
  heatmap,
  range,
  onRangeChange,
  refresh,
}: {
  readonly heatmap: UseQueryResult<HeatmapView>;
  readonly range: HeatmapRange;
  readonly onRangeChange: (range: HeatmapRange) => void;
  readonly refresh: RefreshMutation;
}): ReactElement => (
  <div className="flex flex-col gap-6">
    <div className="flex items-center justify-between gap-4">
      <RangeToggle range={range} onRangeChange={onRangeChange} />
      <Button
        variant="outline"
        size="sm"
        onClick={() => refresh.mutate()}
        disabled={refresh.isPending}
      >
        {refresh.isPending ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : null}
        Refresh
      </Button>
    </div>
    {refresh.error !== null ? <ErrorAlert error={refresh.error} /> : null}
    <HeatmapSection heatmap={heatmap} range={range} />
  </div>
);

/** Builds the Progress page around the host-wired ProgressApi. */
export const createProgressScreen = (
  api: ProgressApi,
  now: () => number = Date.now,
) => {
  const ProgressScreen = (): ReactElement => {
    const [range, setRange] = useState<HeatmapRange>("year");
    const status = useQuery({
      queryKey: progressStatusKey,
      queryFn: () => api.status(),
    });
    const connected = status.data?.connected === true;
    const heatmap = useQuery({
      queryKey: progressHeatmapKey(range),
      queryFn: () => api.heatmap(range),
      enabled: connected,
    });
    const refresh = useMutation({ mutationFn: () => api.refresh() });
    useStaleRefresh(status.data, refresh, now);

    const body = (): ReactElement => {
      if (status.error !== null) {
        return <ErrorAlert error={status.error} />;
      }
      if (status.data === undefined) {
        return <Skeleton className="h-40 w-full" />;
      }
      if (!status.data.connected) {
        return <ConnectPrompt />;
      }
      return (
        <ConnectedView
          heatmap={heatmap}
          range={range}
          onRangeChange={setRange}
          refresh={refresh}
        />
      );
    };

    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <header className="mb-8">
          <h1 className="text-lg font-semibold tracking-tight">Progress</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your GitHub contribution heatmap.
          </p>
        </header>
        {body()}
      </div>
    );
  };
  return ProgressScreen;
};
