// The head-to-head widget: pick two drivers from the session and compare
// their best lap, finish position, and pit count as mirrored bars. It
// composes three read queries (result, laps, pits) rather than a dedicated
// endpoint, since every input already exists on the seam.

import {
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { ResultRow } from "../../contract";
import type { F1Api } from "../api";
import { formatLapTime, teamColour } from "../palette";
import { f1DetailKey, f1ResultKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";
import { fastestLap } from "./lap-utils";
import { RaceExplorerWidget } from "./session-picker";

interface Metric {
  readonly label: string;
  readonly a: number | null;
  readonly b: number | null;
  readonly format: (value: number) => string;
}

const DriverSelect = ({
  drivers,
  value,
  onChange,
}: {
  readonly drivers: readonly ResultRow[];
  readonly value: number;
  readonly onChange: (driverNumber: number) => void;
}): ReactElement => (
  <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
    <SelectTrigger size="sm" className="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {drivers.map((driver) => (
        <SelectItem
          key={driver.driverNumber}
          value={String(driver.driverNumber)}
        >
          {driver.nameAcronym ?? String(driver.driverNumber)}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/** One metric as mirrored bars; the better (lower) value is emphasised. */
const MetricRow = ({
  metric,
  colourA,
  colourB,
}: {
  readonly metric: Metric;
  readonly colourA: string;
  readonly colourB: string;
}): ReactElement => {
  const max = Math.max(metric.a ?? 0, metric.b ?? 0, 1);
  const aWins =
    metric.a !== null && (metric.b === null || metric.a <= metric.b);
  const bWins = metric.b !== null && (metric.a === null || metric.b < metric.a);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-center text-xs text-muted-foreground">
        {metric.label}
      </p>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "tnum w-14 shrink-0 text-right text-sm",
            aWins && "font-semibold",
          )}
        >
          {metric.a === null ? "-" : metric.format(metric.a)}
        </span>
        <div className="flex flex-1 items-center gap-0.5">
          <div className="flex flex-1 justify-end">
            <span
              className="h-3 rounded-l"
              style={{
                width: `${((metric.a ?? 0) / max) * 100}%`,
                backgroundColor: colourA,
              }}
            />
          </div>
          <div className="flex flex-1 justify-start">
            <span
              className="h-3 rounded-r"
              style={{
                width: `${((metric.b ?? 0) / max) * 100}%`,
                backgroundColor: colourB,
              }}
            />
          </div>
        </div>
        <span
          className={cn(
            "tnum w-14 shrink-0 text-left text-sm",
            bWins && "font-semibold",
          )}
        >
          {metric.b === null ? "-" : metric.format(metric.b)}
        </span>
      </div>
    </div>
  );
};

const HeadToHeadBody = ({
  api,
  sessionKey,
}: {
  readonly api: F1Api;
  readonly sessionKey: number;
}): ReactElement => {
  const resultQuery = useQuery({
    queryKey: f1ResultKey(sessionKey),
    queryFn: () => api.sessionResult({ sessionKey }),
  });
  const lapsQuery = useQuery({
    queryKey: f1DetailKey("laps", sessionKey),
    queryFn: () => api.laps({ sessionKey }),
  });
  const pitsQuery = useQuery({
    queryKey: f1DetailKey("pits", sessionKey),
    queryFn: () => api.pits({ sessionKey }),
  });
  const [pair, setPair] = useState<{ a: number; b: number } | null>(null);

  if (resultQuery.error !== null) {
    return <WidgetError message={readableError(resultQuery.error)} />;
  }
  const result = resultQuery.data;
  if (result === undefined) {
    return <WidgetSkeleton rows={5} />;
  }
  const drivers = result.rows;
  if (drivers.length < 2) {
    return (
      <WidgetEmpty message="Not enough drivers to compare for this session." />
    );
  }

  const first = drivers[0]?.driverNumber ?? 0;
  const second = drivers[1]?.driverNumber ?? 0;
  const selected = pair ?? { a: first, b: second };
  const driverA =
    drivers.find((d) => d.driverNumber === selected.a) ?? drivers[0];
  const driverB =
    drivers.find((d) => d.driverNumber === selected.b) ?? drivers[1];
  if (driverA === undefined || driverB === undefined) {
    return (
      <WidgetEmpty message="Not enough drivers to compare for this session." />
    );
  }

  const bestLapOf = (driverNumber: number): number | null => {
    const laps = lapsQuery.data?.find((d) => d.driverNumber === driverNumber);
    return laps === undefined ? null : fastestLap(laps.laps);
  };
  const pitCountOf = (driverNumber: number): number =>
    (pitsQuery.data ?? []).filter((p) => p.driverNumber === driverNumber)
      .length;

  const metrics: Metric[] = [
    {
      label: "Best lap",
      a: bestLapOf(driverA.driverNumber),
      b: bestLapOf(driverB.driverNumber),
      format: (value) => formatLapTime(value),
    },
    {
      label: "Finish position",
      a: driverA.position,
      b: driverB.position,
      format: (value) => `P${value}`,
    },
    {
      label: "Pit stops",
      a: pitCountOf(driverA.driverNumber),
      b: pitCountOf(driverB.driverNumber),
      format: (value) => String(value),
    },
  ];
  const colourA = teamColour(driverA.teamColour);
  const colourB = teamColour(driverB.teamColour);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <DriverSelect
          drivers={drivers}
          value={driverA.driverNumber}
          onChange={(a) => setPair({ a, b: selected.b })}
        />
        <span className="shrink-0 text-xs text-muted-foreground">vs</span>
        <DriverSelect
          drivers={drivers}
          value={driverB.driverNumber}
          onChange={(b) => setPair({ a: selected.a, b })}
        />
      </div>
      <div className="flex flex-col gap-3">
        {metrics.map((metric) => (
          <MetricRow
            key={metric.label}
            metric={metric}
            colourA={colourA}
            colourB={colourB}
          />
        ))}
      </div>
    </div>
  );
};

export const HeadToHeadWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => (
  <RaceExplorerWidget api={api}>
    {(sessionKey) => <HeadToHeadBody api={api} sessionKey={sessionKey} />}
  </RaceExplorerWidget>
);
