// The weather widget: air and track temperature over the session as two
// lines, with a header summarising the latest conditions (wet or dry, and
// wind speed). Temperatures use fixed colours (air cool blue, track warm
// orange) since they are not tied to any team.

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
import type { WeatherPoint } from "../../contract";
import type { F1Api } from "../api";
import { f1DetailKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";
import { RaceExplorerWidget } from "./session-picker";

const AIR_COLOUR = "#0067AD";
const TRACK_COLOUR = "#F97350";

const buildRows = (points: readonly WeatherPoint[]): Record<string, number>[] =>
  points.map((point, index) => {
    const row: Record<string, number> = { bucket: index };
    if (point.airTemperature !== null) {
      row.air = point.airTemperature;
    }
    if (point.trackTemperature !== null) {
      row.track = point.trackTemperature;
    }
    return row;
  });

const ConditionsHeader = ({
  latest,
}: {
  readonly latest: WeatherPoint;
}): ReactElement => {
  const wet = latest.rainfall !== null && latest.rainfall > 0;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className={wet ? "font-semibold text-[#0067AD]" : undefined}>
        {wet ? "Wet track" : "Dry track"}
      </span>
      {latest.airTemperature !== null ? (
        <span className="tnum">Air {latest.airTemperature.toFixed(1)}C</span>
      ) : null}
      {latest.trackTemperature !== null ? (
        <span className="tnum">
          Track {latest.trackTemperature.toFixed(1)}C
        </span>
      ) : null}
      {latest.windSpeed !== null ? (
        <span className="tnum">Wind {latest.windSpeed.toFixed(1)} m/s</span>
      ) : null}
    </div>
  );
};

const WeatherBody = ({
  api,
  sessionKey,
}: {
  readonly api: F1Api;
  readonly sessionKey: number;
}): ReactElement => {
  const query = useQuery({
    queryKey: f1DetailKey("weather", sessionKey),
    queryFn: () => api.weather({ sessionKey }),
  });

  if (query.error !== null) {
    return <WidgetError message={readableError(query.error)} />;
  }
  const points = query.data;
  if (points === undefined) {
    return <WidgetSkeleton rows={5} />;
  }
  if (points.length === 0) {
    return <WidgetEmpty message="No weather data for this session." />;
  }

  const rows = buildRows(points);
  const latest = points[points.length - 1];
  return (
    <div className="flex h-full flex-col gap-2">
      {latest === undefined ? null : <ConditionsHeader latest={latest} />}
      <div className="min-h-40 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeOpacity={0.15} vertical={false} />
            <XAxis dataKey="bucket" hide />
            <YAxis
              width={32}
              tick={{ fontSize: 11 }}
              stroke="currentColor"
              strokeOpacity={0.4}
              tickFormatter={(value: number) => `${value}C`}
            />
            <Tooltip
              formatter={(value: number) => `${value.toFixed(1)}C`}
              labelFormatter={() => ""}
              contentStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="air"
              name="Air"
              stroke={AIR_COLOUR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="track"
              name="Track"
              stroke={TRACK_COLOUR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const WeatherWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => (
  <RaceExplorerWidget api={api}>
    {(sessionKey) => <WeatherBody api={api} sessionKey={sessionKey} />}
  </RaceExplorerWidget>
);
