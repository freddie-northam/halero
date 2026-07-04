// The pit-stops widget: every stop in the session as a table (driver, lap,
// and time in the pit lane), ordered by lap, with the quickest stop
// highlighted. Times use tabular-nums so the column stays aligned.

import { cn } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { PitStop } from "../../contract";
import type { F1Api } from "../api";
import { formatSeconds, teamColour } from "../palette";
import { f1DetailKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";
import { RaceExplorerWidget } from "./session-picker";

/** The quickest pit-lane time across the stops, or null when none timed. */
const fastestLane = (stops: readonly PitStop[]): number | null => {
  let best: number | null = null;
  for (const stop of stops) {
    if (stop.laneDuration === null) {
      continue;
    }
    if (best === null || stop.laneDuration < best) {
      best = stop.laneDuration;
    }
  }
  return best;
};

const PitStopsBody = ({
  api,
  sessionKey,
}: {
  readonly api: F1Api;
  readonly sessionKey: number;
}): ReactElement => {
  const query = useQuery({
    queryKey: f1DetailKey("pits", sessionKey),
    queryFn: () => api.pits({ sessionKey }),
  });

  if (query.error !== null) {
    return <WidgetError message={readableError(query.error)} />;
  }
  const stops = query.data;
  if (stops === undefined) {
    return <WidgetSkeleton rows={6} />;
  }
  if (stops.length === 0) {
    return <WidgetEmpty message="No pit stops recorded for this session." />;
  }

  const fastest = fastestLane(stops);
  return (
    <ul className="flex h-full flex-col overflow-y-auto">
      {stops.map((stop) => {
        const isFastest = fastest !== null && stop.laneDuration === fastest;
        return (
          <li
            key={`${stop.driverNumber}-${stop.lapNumber}`}
            className="flex items-center gap-2 border-b py-1.5 text-sm last:border-b-0"
          >
            <span className="tnum w-8 shrink-0 text-right text-xs text-muted-foreground">
              L{stop.lapNumber}
            </span>
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: teamColour(stop.teamColour) }}
            />
            <span className="min-w-0 flex-1 truncate font-semibold">
              {stop.nameAcronym ?? String(stop.driverNumber)}
              <span className="ml-1.5 truncate font-normal text-muted-foreground">
                {stop.teamName ?? ""}
              </span>
            </span>
            <span
              className={cn(
                "tnum shrink-0 text-right",
                isFastest && "font-semibold text-[#43B02A]",
              )}
            >
              {formatSeconds(stop.laneDuration)}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

export const PitStopsWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => (
  <RaceExplorerWidget api={api}>
    {(sessionKey) => <PitStopsBody api={api} sessionKey={sessionKey} />}
  </RaceExplorerWidget>
);
