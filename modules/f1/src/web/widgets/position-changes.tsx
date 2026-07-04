// The position-changes widget: each driver's track position over the course
// of the session as a team-coloured line, with the Y axis inverted so P1
// sits at the top. The raw position feed is dense telemetry, so it is
// downsampled into a fixed set of time buckets (step-held to the last known
// position) to keep the chart light and readable.

import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DriverPositions } from "../../contract";
import type { F1Api } from "../api";
import { teamColour } from "../palette";
import { f1DetailKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";
import { RaceExplorerWidget } from "./session-picker";

const BUCKETS = 48;
const MAX_DRIVERS = 10;

interface Sample {
  readonly ms: number;
  readonly position: number;
}

interface Series {
  readonly key: string;
  readonly colour: string;
  readonly lastPosition: number;
}

const toSamples = (driver: DriverPositions): Sample[] => {
  const out: Sample[] = [];
  for (const point of driver.points) {
    const ms = Date.parse(point.date);
    if (Number.isNaN(ms) || point.position === null) {
      continue;
    }
    out.push({ ms, position: point.position });
  }
  return out;
};

/** Downsamples the dense position feed into BUCKETS step-held time rows. */
const buildChart = (
  drivers: readonly DriverPositions[],
): { rows: Record<string, number>[]; series: Series[]; maxPos: number } => {
  const bySeries = new Map<string, { colour: string; samples: Sample[] }>();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let maxPos = 1;
  for (const driver of drivers) {
    const samples = toSamples(driver);
    if (samples.length === 0) {
      continue;
    }
    const key = driver.nameAcronym ?? String(driver.driverNumber);
    bySeries.set(key, { colour: teamColour(driver.teamColour), samples });
    for (const sample of samples) {
      min = Math.min(min, sample.ms);
      max = Math.max(max, sample.ms);
      maxPos = Math.max(maxPos, sample.position);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { rows: [], series: [], maxPos };
  }

  const series: Series[] = [...bySeries.entries()]
    .map(([key, value]) => ({
      key,
      colour: value.colour,
      lastPosition: value.samples[value.samples.length - 1]?.position ?? 99,
    }))
    .sort((a, b) => a.lastPosition - b.lastPosition)
    .slice(0, MAX_DRIVERS);

  const span = max - min;
  const rows: Record<string, number>[] = [];
  for (let i = 0; i < BUCKETS; i += 1) {
    const time = span === 0 ? min : min + (span * i) / (BUCKETS - 1);
    const row: Record<string, number> = { bucket: i };
    for (const line of series) {
      const samples = bySeries.get(line.key)?.samples ?? [];
      let held: number | null = null;
      for (const sample of samples) {
        if (sample.ms <= time) {
          held = sample.position;
        } else {
          break;
        }
      }
      if (held !== null) {
        row[line.key] = held;
      }
    }
    rows.push(row);
  }
  return { rows, series, maxPos };
};

const PositionChangesBody = ({
  api,
  sessionKey,
}: {
  readonly api: F1Api;
  readonly sessionKey: number;
}): ReactElement => {
  const query = useQuery({
    queryKey: f1DetailKey("positions", sessionKey),
    queryFn: () => api.positions({ sessionKey }),
  });

  if (query.error !== null) {
    return <WidgetError message={readableError(query.error)} />;
  }
  const drivers = query.data;
  if (drivers === undefined) {
    return <WidgetSkeleton rows={6} />;
  }
  const { rows, series, maxPos } = buildChart(drivers);
  if (rows.length === 0 || series.length === 0) {
    return <WidgetEmpty message="No position data for this session." />;
  }

  return (
    <div className="h-full min-h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={rows}
          margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey="bucket" hide />
          <YAxis
            width={28}
            reversed
            allowDecimals={false}
            domain={[1, maxPos]}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            strokeOpacity={0.4}
          />
          <Tooltip
            formatter={(value: number) => `P${value}`}
            labelFormatter={() => ""}
            contentStyle={{ fontSize: 12 }}
          />
          {series.map((line) => (
            <Line
              key={line.key}
              type="stepAfter"
              dataKey={line.key}
              stroke={line.colour}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export const PositionChangesWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => (
  <RaceExplorerWidget api={api}>
    {(sessionKey) => <PositionChangesBody api={api} sessionKey={sessionKey} />}
  </RaceExplorerWidget>
);
