// The lap-chart widget: each of the top runners' lap times plotted against
// lap number as a team-coloured line. Pit and outlier laps are filtered out
// (via the shared lap-utils helper) so the lines read as clean pace traces
// rather than sawtooths. Drivers are capped to the most active few to keep
// the chart legible.

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
import type { DriverLaps } from "../../contract";
import type { F1Api } from "../api";
import { formatLapTime, teamColour } from "../palette";
import { f1DetailKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";
import { filterRacingLaps } from "./lap-utils";
import { RaceExplorerWidget } from "./session-picker";

const MAX_DRIVERS = 6;

interface Series {
  readonly key: string;
  readonly colour: string;
}

/** Picks the drivers with the most racing laps and builds recharts rows. */
const buildChart = (
  drivers: readonly DriverLaps[],
): { rows: Record<string, number>[]; series: Series[] } => {
  const withRacing = drivers
    .map((driver) => ({ driver, laps: filterRacingLaps(driver.laps) }))
    .filter((entry) => entry.laps.length > 0)
    .sort((a, b) => b.laps.length - a.laps.length)
    .slice(0, MAX_DRIVERS);

  const byLap = new Map<number, Record<string, number>>();
  const series: Series[] = [];
  for (const { driver, laps } of withRacing) {
    const key = driver.nameAcronym ?? String(driver.driverNumber);
    series.push({ key, colour: teamColour(driver.teamColour) });
    for (const lap of laps) {
      if (lap.lapDuration === null) {
        continue;
      }
      const row = byLap.get(lap.lapNumber) ?? { lapNumber: lap.lapNumber };
      row[key] = lap.lapDuration;
      byLap.set(lap.lapNumber, row);
    }
  }
  const rows = [...byLap.values()].sort(
    (a, b) => (a.lapNumber ?? 0) - (b.lapNumber ?? 0),
  );
  return { rows, series };
};

const LapChartBody = ({
  api,
  sessionKey,
}: {
  readonly api: F1Api;
  readonly sessionKey: number;
}): ReactElement => {
  const query = useQuery({
    queryKey: f1DetailKey("laps", sessionKey),
    queryFn: () => api.laps({ sessionKey }),
  });

  if (query.error !== null) {
    return <WidgetError message={readableError(query.error)} />;
  }
  const drivers = query.data;
  if (drivers === undefined) {
    return <WidgetSkeleton rows={6} />;
  }
  const { rows, series } = buildChart(drivers);
  if (rows.length === 0) {
    return <WidgetEmpty message="No lap-time data for this session." />;
  }

  return (
    <div className="h-full min-h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={rows}
          margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeOpacity={0.15} vertical={false} />
          <XAxis
            dataKey="lapNumber"
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            strokeOpacity={0.4}
          />
          <YAxis
            width={52}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            strokeOpacity={0.4}
            domain={["dataMin - 0.5", "dataMax + 0.5"]}
            tickFormatter={(value: number) => formatLapTime(value)}
          />
          <Tooltip
            formatter={(value: number) => formatLapTime(value)}
            labelFormatter={(label: number) => `Lap ${label}`}
            contentStyle={{ fontSize: 12 }}
          />
          {series.map((line) => (
            <Line
              key={line.key}
              type="monotone"
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

export const LapChartWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => (
  <RaceExplorerWidget api={api}>
    {(sessionKey) => <LapChartBody api={api} sessionKey={sessionKey} />}
  </RaceExplorerWidget>
);
