// The weekend-schedule widget: the current or next race weekend's
// sessions (FP1..Race) as rows of name, local day and time, and a state
// pill, with any live session emphasized. The weekend comes from
// api.nextUp() (the live-or-next meeting the server already resolved),
// and api.schedule() supplies the home timezone the rows format against.

import { Badge, cn } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { F1Api } from "../api";
import {
  formatSessionDay,
  formatSessionTime,
  sessionStateBadge,
} from "../palette";
import { f1NextUpKey, f1ScheduleKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";

export const WeekendScheduleWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => {
  const scheduleQuery = useQuery({
    queryKey: f1ScheduleKey,
    queryFn: () => api.schedule(),
  });
  const nextQuery = useQuery({
    queryKey: f1NextUpKey,
    queryFn: () => api.nextUp(),
  });

  const error = scheduleQuery.error ?? nextQuery.error;
  if (error !== null) {
    return <WidgetError message={readableError(error)} />;
  }
  const schedule = scheduleQuery.data;
  const next = nextQuery.data;
  if (schedule === undefined || next === undefined) {
    return <WidgetSkeleton rows={5} />;
  }
  const weekend = next.weekend;
  if (weekend === null) {
    return <WidgetEmpty message="No race weekend scheduled right now." />;
  }
  const tz = schedule.homeTimezone;

  return (
    <ul className="flex flex-col gap-1">
      {weekend.sessions.map((session) => {
        const pill = sessionStateBadge(session.state);
        return (
          <li
            key={session.entityId}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm",
              session.state === "live" && "bg-muted/60 font-medium",
              session.state === "done" && "text-muted-foreground",
            )}
          >
            <span className="truncate">{session.sessionName}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="tnum text-xs text-muted-foreground">
                {formatSessionDay(session.dateStart, tz)}{" "}
                {formatSessionTime(session.dateStart, tz)}
              </span>
              <Badge className={pill.className}>{pill.label}</Badge>
            </span>
          </li>
        );
      })}
    </ul>
  );
};
