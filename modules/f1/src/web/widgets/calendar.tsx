// The calendar widget: the whole season as compact rows, one per race
// weekend. Each row carries the round number, country flag, GP name, its
// date range, and the circuit. Finished weekends dim back; the next
// weekend (the first that is not yet done) gets a coral accent so the
// eye lands on what is coming. Home timezone from the schedule formats
// the date range.

import { cn } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { Weekend } from "../../contract";
import type { F1Api } from "../api";
import { formatSessionDay } from "../palette";
import { f1ScheduleKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";

/** "6 - 8 Jul" style range; a single day when start and end coincide. */
const dateRange = (weekend: Weekend, tz: string): string => {
  const start = formatSessionDay(weekend.dateStart, tz);
  const end = formatSessionDay(weekend.dateEnd, tz);
  if (weekend.dateStart === null) {
    return "Dates TBC";
  }
  return end === start || weekend.dateEnd === null
    ? start
    : `${start} - ${end}`;
};

export const CalendarWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => {
  const scheduleQuery = useQuery({
    queryKey: f1ScheduleKey,
    queryFn: () => api.schedule(),
  });

  if (scheduleQuery.error !== null) {
    return <WidgetError message={readableError(scheduleQuery.error)} />;
  }
  const schedule = scheduleQuery.data;
  if (schedule === undefined) {
    return <WidgetSkeleton rows={6} />;
  }
  if (schedule.weekends.length === 0) {
    return <WidgetEmpty message="No calendar published yet." />;
  }
  const tz = schedule.homeTimezone;
  const nextIndex = schedule.weekends.findIndex(
    (weekend) => weekend.state !== "done",
  );

  return (
    <ul className="flex flex-col">
      {schedule.weekends.map((weekend, index) => {
        const past = weekend.state === "done";
        const isNext = index === nextIndex;
        return (
          <li
            key={weekend.meetingKey}
            className={cn(
              "flex items-center gap-3 border-b py-2 text-sm last:border-b-0",
              past && "text-muted-foreground opacity-70",
              isNext && "border-l-2 border-l-[#DA291C] pl-2",
            )}
          >
            <span className="tnum w-6 shrink-0 text-xs text-muted-foreground">
              R{weekend.round}
            </span>
            {weekend.countryFlagUrl === null ? (
              <span className="h-4 w-6 shrink-0" aria-hidden="true" />
            ) : (
              <img
                src={weekend.countryFlagUrl}
                alt={weekend.countryName ?? ""}
                className="h-4 w-6 shrink-0 rounded-sm object-cover"
              />
            )}
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate",
                  isNext ? "font-semibold" : "font-medium",
                )}
              >
                {weekend.meetingName ?? weekend.countryName ?? "Grand Prix"}
              </span>
              {weekend.circuitShortName === null ? null : (
                <span className="block truncate text-xs text-muted-foreground">
                  {weekend.circuitShortName}
                </span>
              )}
            </span>
            <span className="tnum shrink-0 text-xs text-muted-foreground">
              {dateRange(weekend, tz)}
            </span>
          </li>
        );
      })}
    </ul>
  );
};
