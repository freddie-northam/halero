// The tyre-strategy widget: one horizontal bar per driver, split into
// stint segments coloured by compound, with a marker at each pit stop and
// a lap axis underneath. This is the race explorer's signature view, so it
// leans on the shared session picker and the pure stint-to-bar mapper.

import { cn } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { DriverStints, PitStop } from "../../contract";
import type { F1Api } from "../api";
import { teamColour, tyreColour } from "../palette";
import { f1DetailKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";
import { RaceExplorerWidget } from "./session-picker";
import { type LapRange, lapRange, stintBar } from "./stint-utils";

const DriverStrategyRow = ({
  driver,
  pits,
  range,
}: {
  readonly driver: DriverStints;
  readonly pits: readonly PitStop[];
  readonly range: LapRange;
}): ReactElement => {
  const total = range.end - range.start + 1;
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="flex w-12 shrink-0 items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: teamColour(driver.teamColour) }}
        />
        <span className="font-semibold">
          {driver.nameAcronym ?? String(driver.driverNumber)}
        </span>
      </span>
      <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded bg-muted">
        {driver.stints.map((stint) => {
          const bar = stintBar(stint, range);
          if (bar === null) {
            return null;
          }
          return (
            <span
              key={stint.stintNumber}
              className="absolute inset-y-0 border-r border-background/60"
              style={{
                left: `${bar.offsetPct}%`,
                width: `${bar.widthPct}%`,
                backgroundColor: tyreColour(stint.compound),
              }}
              title={`${stint.compound ?? "Unknown"} (laps ${stint.lapStart ?? "?"}-${stint.lapEnd ?? "?"})`}
            />
          );
        })}
        {pits.map((pit) => {
          const leftPct = ((pit.lapNumber - range.start) / total) * 100;
          if (leftPct < 0 || leftPct > 100) {
            return null;
          }
          return (
            <span
              key={pit.lapNumber}
              aria-hidden="true"
              className="absolute inset-y-0 w-px bg-foreground/70"
              style={{ left: `${leftPct}%` }}
            />
          );
        })}
      </span>
    </li>
  );
};

const TyreStrategyBody = ({
  api,
  sessionKey,
}: {
  readonly api: F1Api;
  readonly sessionKey: number;
}): ReactElement => {
  const stintsQuery = useQuery({
    queryKey: f1DetailKey("stints", sessionKey),
    queryFn: () => api.stints({ sessionKey }),
  });
  const pitsQuery = useQuery({
    queryKey: f1DetailKey("pits", sessionKey),
    queryFn: () => api.pits({ sessionKey }),
  });

  if (stintsQuery.error !== null) {
    return <WidgetError message={readableError(stintsQuery.error)} />;
  }
  const drivers = stintsQuery.data;
  if (drivers === undefined) {
    return <WidgetSkeleton rows={6} />;
  }
  if (drivers.length === 0) {
    return <WidgetEmpty message="No tyre-strategy data for this session." />;
  }

  const range = lapRange(drivers);
  const pitsByDriver = new Map<number, PitStop[]>();
  for (const pit of pitsQuery.data ?? []) {
    const list = pitsByDriver.get(pit.driverNumber) ?? [];
    list.push(pit);
    pitsByDriver.set(pit.driverNumber, list);
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <ul className="flex flex-col gap-1.5 overflow-y-auto">
        {drivers.map((driver) => (
          <DriverStrategyRow
            key={driver.driverNumber}
            driver={driver}
            pits={pitsByDriver.get(driver.driverNumber) ?? []}
            range={range}
          />
        ))}
      </ul>
      <div className="tnum flex justify-between border-t pt-1 text-xs text-muted-foreground">
        <span>Lap {range.start}</span>
        <span className={cn("shrink-0")}>Lap {range.end}</span>
      </div>
    </div>
  );
};

export const TyreStrategyWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => (
  <RaceExplorerWidget api={api}>
    {(sessionKey) => <TyreStrategyBody api={api} sessionKey={sessionKey} />}
  </RaceExplorerWidget>
);
