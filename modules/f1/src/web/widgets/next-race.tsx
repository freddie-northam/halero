// The next-race widget: a hero for the upcoming grand prix. The circuit
// image (when OpenF1 has one) backs a header carrying the country flag
// and GP name, a live countdown ticks down to the next session's start,
// and the weekend's sessions list below shows local times and state
// pills. Countdown and sessions come from api.nextUp(); the home
// timezone rides along from the cached schedule query (browser zone as a
// last resort) so times read the same as every other widget.

import { Badge, cn } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useEffect, useState } from "react";
import type { NextUp, Weekend } from "../../contract";
import type { F1Api } from "../api";
import {
  formatSessionDay,
  formatSessionTime,
  sessionStateBadge,
} from "../palette";
import { f1NextUpKey, f1ScheduleKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";

const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** A d/h/m/s countdown string, or "Underway" once the target has passed. */
const formatCountdown = (target: string | null, now: number): string | null => {
  if (target === null) {
    return null;
  }
  const start = new Date(target).getTime();
  if (Number.isNaN(start)) {
    return null;
  }
  const remaining = start - now;
  if (remaining <= 0) {
    return "Underway";
  }
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds]
    .map((unit) => String(unit).padStart(2, "0"))
    .join(":");
  return days > 0 ? `${days}d ${clock}` : clock;
};

/** Re-renders once a second while a target instant is in the future. */
const useCountdown = (target: string | null): string | null => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target === null) {
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  return formatCountdown(target, now);
};

const WeekendHero = ({
  next,
  weekend,
  tz,
}: {
  readonly next: NextUp;
  readonly weekend: Weekend;
  readonly tz: string;
}): ReactElement => {
  const countdown = useCountdown(next.session?.dateStart ?? null);
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative overflow-hidden rounded-md border bg-muted/30 p-3">
        {weekend.circuitImageUrl === null ? null : (
          <img
            src={weekend.circuitImageUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full object-cover opacity-15"
          />
        )}
        <div className="relative flex items-center gap-2">
          {weekend.countryFlagUrl === null ? null : (
            <img
              src={weekend.countryFlagUrl}
              alt={weekend.countryName ?? ""}
              className="h-4 w-6 shrink-0 rounded-sm object-cover"
            />
          )}
          <span className="truncate text-sm font-semibold">
            {weekend.meetingName ?? weekend.countryName ?? "Next grand prix"}
          </span>
        </div>
        {countdown === null ? null : (
          <div className="relative mt-2">
            <p className="text-xs text-muted-foreground">
              {next.session?.sessionName ?? "Next session"} in
            </p>
            <p className="tnum text-2xl font-semibold tracking-tight">
              {countdown}
            </p>
          </div>
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {weekend.sessions.map((session) => {
          const pill = sessionStateBadge(session.state);
          return (
            <li
              key={session.entityId}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm",
                session.state === "live" && "bg-muted/60",
              )}
            >
              <span className="truncate font-medium">
                {session.sessionName}
              </span>
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
    </div>
  );
};

export const NextRaceWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => {
  const nextQuery = useQuery({
    queryKey: f1NextUpKey,
    queryFn: () => api.nextUp(),
  });
  // Best-effort home timezone from the cached schedule; the widget still
  // renders (in browser-local time) before or without that query.
  const scheduleQuery = useQuery({
    queryKey: f1ScheduleKey,
    queryFn: () => api.schedule(),
  });
  const tz = scheduleQuery.data?.homeTimezone ?? BROWSER_TZ;

  if (nextQuery.error !== null) {
    return <WidgetError message={readableError(nextQuery.error)} />;
  }
  const next = nextQuery.data;
  if (next === undefined) {
    return <WidgetSkeleton rows={5} />;
  }
  if (next.weekend === null) {
    return <WidgetEmpty message="No upcoming race on the calendar." />;
  }
  return <WeekendHero next={next} weekend={next.weekend} tz={tz} />;
};
