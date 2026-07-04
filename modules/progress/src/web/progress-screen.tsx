// The Progress page: contribution heatmaps fed entirely through the narrow
// ProgressApi seam (status + heatmap + refresh). No tRPC client and no
// @halero/db here, ever. It is source-agnostic: a source selector picks
// "All" (the merged view) or any connected source, and each source draws
// with its own colour ramp. The grid itself takes any five-stop ramp.

import {
  Alert,
  AlertDescription,
  Button,
  cn,
  Loader2,
  Skeleton,
} from "@halero/ui";
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useEffect, useRef, useState } from "react";
import type {
  HeatmapRange,
  HeatmapView,
  ProgressStatus,
  SourceStatus,
} from "../contract";
import type { ProgressApi, RefreshResult } from "./api";
import { HeatmapGrid } from "./components/heatmap-grid";
import { RangeToggle } from "./components/range-toggle";
import { StatsHeader } from "./components/stats-header";
import { progressHeatmapKey, progressStatusKey } from "./queries";
import { readableError } from "./readable-error";

// Per-source colour ramps (empty -> max). "all" (the merged view) and any
// source without its own ramp use the Halero brand ramp (coral #FF5A5F).
const BRAND_RAMP = [
  "#f5f5f4",
  "#ffd0d1",
  "#ffa5a8",
  "#ff7a7e",
  "#ff5a5f",
] as const;
const RAMPS: Record<string, readonly string[]> = {
  all: BRAND_RAMP,
  github: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  "claude-code": ["#f5f5f4", "#f8cba6", "#f0a875", "#e0894a", "#c2410c"],
  codex: ["#f5f5f4", "#a7d8d0", "#5fb3a8", "#2f8f82", "#0f766e"],
  "wispr-flow": ["#f5f5f4", "#d6bcfa", "#b183f0", "#8b5cf6", "#6d28d9"],
};
const rampFor = (source: string): readonly string[] =>
  RAMPS[source] ?? BRAND_RAMP;

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

type RefreshMutation = UseMutationResult<RefreshResult, Error, void, unknown>;

const connectedSourcesOf = (
  status: ProgressStatus | undefined,
): readonly SourceStatus[] =>
  status === undefined ? [] : status.sources.filter((s) => s.connected);

const isStale = (lastSyncedAt: number | null, now: number): boolean =>
  lastSyncedAt === null || now - lastSyncedAt > SIX_HOURS_MS;

/**
 * Fires a single refresh on mount when any connected source is missing a
 * sync or is older than six hours. The ref guard keeps it to one shot per
 * page visit even as the status query settles and re-renders.
 */
const useStaleRefresh = (
  status: ProgressStatus | undefined,
  refresh: RefreshMutation,
  now: () => number,
): void => {
  const triggered = useRef(false);
  useEffect(() => {
    if (triggered.current) {
      return;
    }
    const connected = connectedSourcesOf(status);
    if (connected.length === 0) {
      return;
    }
    if (!connected.some((s) => isStale(s.lastSyncedAt, now()))) {
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
    <h2 className="text-base font-semibold">
      Connect a source to see progress
    </h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Connect GitHub, Claude Code, Codex, or Wispr Flow to build your activity
      heatmap.{" "}
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

const SourceTabs = ({
  sources,
  selected,
  onSelect,
}: {
  readonly sources: readonly SourceStatus[];
  readonly selected: string;
  readonly onSelect: (source: string) => void;
}): ReactElement => {
  const options = [
    { id: "all", label: "All" },
    ...sources.map((s) => ({ id: s.id, label: s.displayName })),
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onSelect(option.id)}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm",
            option.id === selected
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:bg-accent/60",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

const HeatmapSection = ({
  heatmap,
  range,
  source,
}: {
  readonly heatmap: UseQueryResult<HeatmapView>;
  readonly range: HeatmapRange;
  readonly source: string;
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
      <HeatmapGrid days={heatmap.data.days} colorRamp={rampFor(source)} />
    </>
  );
};

/** Builds the Progress page around the host-wired ProgressApi. */
export const createProgressScreen = (
  api: ProgressApi,
  now: () => number = Date.now,
) => {
  const ProgressScreen = (): ReactElement => {
    const [range, setRange] = useState<HeatmapRange>("year");
    const [source, setSource] = useState<string>("all");
    const status = useQuery({
      queryKey: progressStatusKey,
      queryFn: () => api.status(),
    });
    const connected = connectedSourcesOf(status.data);
    // Fall back to "all" if the selected source is no longer connected.
    const activeSource =
      source === "all" || connected.some((s) => s.id === source)
        ? source
        : "all";
    const heatmap = useQuery({
      queryKey: progressHeatmapKey(range, activeSource),
      queryFn: () =>
        api.heatmap(range, activeSource === "all" ? undefined : activeSource),
      enabled: connected.length > 0,
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
      if (connected.length === 0) {
        return <ConnectPrompt />;
      }
      return (
        <div className="flex flex-col gap-6">
          <SourceTabs
            sources={connected}
            selected={activeSource}
            onSelect={setSource}
          />
          <div className="flex items-center justify-between gap-4">
            <RangeToggle range={range} onRangeChange={setRange} />
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
          <HeatmapSection
            heatmap={heatmap}
            range={range}
            source={activeSource}
          />
        </div>
      );
    };

    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <header className="mb-8">
          <h1 className="text-lg font-semibold tracking-tight">Progress</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your activity across GitHub, Claude Code, Codex, and Wispr Flow.
          </p>
        </header>
        {body()}
      </div>
    );
  };
  return ProgressScreen;
};
