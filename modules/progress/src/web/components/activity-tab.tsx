// The Activity tab: a Wispr-style stat-card grid (total, streaks, per-source
// breakdown) over the connected developer sources, then the contribution
// heatmap with a source selector (dev sources only) and a range toggle. The
// merged view narrows the heatmap to the "developer" category.

import { Button, cn, Loader2, Skeleton } from "@halero/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import type { HeatmapRange, SourceStatus } from "../../contract";
import type { ProgressApi } from "../api";
import { progressHeatmapKey, progressSummaryKey } from "../queries";
import {
  ActivityConnectPrompt,
  DEVELOPER_CATEGORY,
  ErrorAlert,
  rampFor,
} from "./developer-common";
import { HeatmapGrid } from "./heatmap-grid";
import { RangeToggle } from "./range-toggle";
import { StatCard } from "./stat-card";

const dayCount = (days: number): string =>
  `${days} ${days === 1 ? "day" : "days"}`;

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

const SummaryCards = ({
  api,
  range,
}: {
  readonly api: ProgressApi;
  readonly range: HeatmapRange;
}): ReactElement => {
  const summary = useQuery({
    queryKey: progressSummaryKey(range),
    queryFn: () => api.summary(range),
  });
  if (summary.error !== null) {
    return <ErrorAlert error={summary.error} />;
  }
  if (summary.data === undefined) {
    return <Skeleton className="h-24 w-full" />;
  }
  const { total, currentStreak, longestStreak, bySource } = summary.data;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatCard label="Contributions" value={total} />
      <StatCard label="Current streak" value={dayCount(currentStreak)} />
      <StatCard label="Longest streak" value={dayCount(longestStreak)} />
      {bySource.map((source) => (
        <StatCard
          key={source.id}
          label={source.displayName}
          value={source.total}
        />
      ))}
    </div>
  );
};

const HeatmapPanel = ({
  api,
  range,
  source,
}: {
  readonly api: ProgressApi;
  readonly range: HeatmapRange;
  readonly source: string;
}): ReactElement => {
  const heatmap = useQuery({
    queryKey: progressHeatmapKey(range, source),
    queryFn: () =>
      source === "all"
        ? api.heatmap(range, undefined, DEVELOPER_CATEGORY)
        : api.heatmap(range, source),
  });
  if (heatmap.error !== null) {
    return <ErrorAlert error={heatmap.error} />;
  }
  if (heatmap.data === undefined) {
    return <Skeleton className="h-40 w-full" />;
  }
  return <HeatmapGrid days={heatmap.data.days} colorRamp={rampFor(source)} />;
};

export const ActivityTab = ({
  api,
  sources,
}: {
  readonly api: ProgressApi;
  readonly sources: readonly SourceStatus[];
}): ReactElement => {
  const [range, setRange] = useState<HeatmapRange>("year");
  const [source, setSource] = useState<string>("all");
  const refresh = useMutation({ mutationFn: () => api.refresh() });
  const activeSource =
    source === "all" || sources.some((s) => s.id === source) ? source : "all";
  if (sources.length === 0) {
    return <ActivityConnectPrompt />;
  }
  return (
    <div className="flex flex-col gap-6">
      <SummaryCards api={api} range={range} />
      <SourceTabs
        sources={sources}
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
      <HeatmapPanel api={api} range={range} source={activeSource} />
    </div>
  );
};
