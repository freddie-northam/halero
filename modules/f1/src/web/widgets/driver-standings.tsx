// The driver-standings widget: the championship table as a ranked list.
// Each row shows the position, a team-colour dot, the driver's headshot,
// acronym and full name, their team, and points (tabular-nums so the
// column stays aligned). Colours come straight from OpenF1's team_colour
// via teamColour(); coral stays reserved for the app's own accents.

import { cn } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { F1Api } from "../api";
import { teamColour } from "../palette";
import { f1StandingsKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";

export const DriverStandingsWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => {
  const query = useQuery({
    queryKey: f1StandingsKey("driver", null),
    queryFn: () => api.driverStandings(),
  });

  if (query.error !== null) {
    return <WidgetError message={readableError(query.error)} />;
  }
  const standings = query.data;
  if (standings === undefined) {
    return <WidgetSkeleton rows={6} />;
  }
  if (standings.length === 0) {
    return <WidgetEmpty message="No driver standings available yet." />;
  }

  return (
    <ul className="flex flex-col">
      {standings.map((driver, index) => (
        <li
          key={driver.driverNumber}
          className="flex items-center gap-2 border-b py-1.5 text-sm last:border-b-0"
        >
          <span className="tnum w-5 shrink-0 text-right text-xs text-muted-foreground">
            {driver.position ?? index + 1}
          </span>
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: teamColour(driver.teamColour) }}
          />
          {driver.headshotUrl === null ? (
            <span
              className="size-6 shrink-0 rounded-full bg-muted"
              aria-hidden="true"
            />
          ) : (
            <img
              src={driver.headshotUrl}
              alt=""
              aria-hidden="true"
              className="size-6 shrink-0 rounded-full object-cover"
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-1.5">
              <span className="font-semibold">
                {driver.nameAcronym ?? String(driver.driverNumber)}
              </span>
              <span className="truncate text-muted-foreground">
                {driver.fullName ?? ""}
              </span>
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {driver.teamName ?? ""}
            </span>
          </span>
          <span className={cn("tnum shrink-0 font-semibold")}>
            {driver.points ?? 0}
          </span>
        </li>
      ))}
    </ul>
  );
};
