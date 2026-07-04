// The live-weather widget: the current trackside conditions during a live
// session. It polls the live.weather seam every fifteen seconds and shows
// air and track temperature, whether it is raining, and the wind as a
// speed plus compass heading. When no session is live the seam returns
// null, so the widget shows a calm empty state rather than an error.

import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { LiveWeather } from "../../contract";
import type { F1Api } from "../api";
import { windCompass } from "../palette";
import { f1LiveLeafKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";

const AIR_COLOUR = "#0067AD";
const TRACK_COLOUR = "#F97350";

const Metric = ({
  label,
  value,
  accent,
}: {
  readonly label: string;
  readonly value: string;
  readonly accent?: string;
}): ReactElement => (
  <div className="flex flex-col gap-0.5 rounded-md border bg-muted/30 p-2.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span
      className="tnum text-lg font-semibold tracking-tight"
      style={accent === undefined ? undefined : { color: accent }}
    >
      {value}
    </span>
  </div>
);

const formatTemp = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? "-" : `${value.toFixed(1)}C`;

const formatWind = (weather: LiveWeather): string => {
  if (weather.windSpeed === null || !Number.isFinite(weather.windSpeed)) {
    return "-";
  }
  const compass = windCompass(weather.windDirection);
  const speed = `${weather.windSpeed.toFixed(1)} m/s`;
  return compass === "" ? speed : `${speed} ${compass}`;
};

export const LiveWeatherWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => {
  const query = useQuery({
    queryKey: f1LiveLeafKey("weather"),
    queryFn: () => api.live.weather(),
    refetchInterval: 15000,
  });

  if (query.error !== null) {
    return <WidgetError message={readableError(query.error)} />;
  }
  const weather = query.data;
  if (weather === undefined) {
    return <WidgetSkeleton rows={3} />;
  }
  if (weather === null) {
    return <WidgetEmpty message="No session is live right now." />;
  }

  const wet = weather.rainfall !== null && weather.rainfall > 0;
  return (
    <div className="flex h-full flex-col gap-2">
      <span
        className={
          wet ? "text-sm font-semibold text-[#0067AD]" : "text-sm font-semibold"
        }
      >
        {wet ? "Rain falling" : "Dry track"}
      </span>
      <div className="grid grid-cols-2 gap-2">
        <Metric
          label="Air"
          value={formatTemp(weather.airTemperature)}
          accent={AIR_COLOUR}
        />
        <Metric
          label="Track"
          value={formatTemp(weather.trackTemperature)}
          accent={TRACK_COLOUR}
        />
        <Metric label="Wind" value={formatWind(weather)} />
        <Metric
          label="Humidity"
          value={
            weather.humidity === null ? "-" : `${Math.round(weather.humidity)}%`
          }
        />
      </div>
    </div>
  );
};
