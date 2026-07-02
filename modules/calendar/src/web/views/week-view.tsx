// The week view, deliberately simple in v0.1: 7 Monday-start day
// columns, an all-day row on top, and timed events stacked
// chronologically with their start times. No absolutely-positioned hour
// grid yet; that arrives with event editing in a later version.

import { cn } from "@halero/ui";
import type { ReactElement } from "react";
import type { AgendaEvent } from "../../contract";
import { EventChip } from "../components/event-chip";
import { RecurrenceIcon } from "../components/recurrence-icon";
import { weekDates } from "../helpers/date-matrix";
import { dayOfMonth, formatTime, formatWeekdayShort } from "../helpers/format";

export interface WeekViewProps {
  /** Any date inside the week on display. */
  readonly anchor: string;
  /** Today in the home timezone; its column header gets the accent ring. */
  readonly today: string;
  readonly eventsByDate: ReadonlyMap<string, readonly AgendaEvent[]>;
  readonly timeZone: string;
}

const TimedEvent = ({
  event,
  timeZone,
}: {
  readonly event: AgendaEvent;
  readonly timeZone: string;
}): ReactElement => (
  <li className="flex min-w-0 items-baseline gap-1.5 text-xs leading-4">
    <span className="tnum shrink-0 text-muted-foreground">
      {formatTime(event.start, timeZone)}
    </span>
    <span className="truncate" title={event.title}>
      {event.title}
    </span>
    {event.recurring ? <RecurrenceIcon /> : null}
  </li>
);

export const WeekView = ({
  anchor,
  today,
  eventsByDate,
  timeZone,
}: WeekViewProps): ReactElement => {
  const dates = weekDates(anchor);
  const eventsFor = (date: string): readonly AgendaEvent[] =>
    eventsByDate.get(date) ?? [];
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="grid grid-cols-7 gap-px bg-border">
        {dates.map((date) => (
          <div
            key={`head-${date}`}
            aria-current={date === today ? "date" : undefined}
            className={cn(
              "flex items-baseline gap-1.5 bg-background px-2 py-1.5",
              date === today && "ring-1 ring-ring ring-inset",
            )}
          >
            <span className="text-xs font-medium text-muted-foreground">
              {formatWeekdayShort(date)}
            </span>
            <span
              className={cn(
                "tnum text-sm font-medium",
                date === today && "text-primary",
              )}
            >
              {dayOfMonth(date)}
            </span>
          </div>
        ))}
        {dates.map((date) => (
          <div
            key={`all-day-${date}`}
            className="flex min-h-7 min-w-0 flex-col gap-px border-t bg-background p-1"
          >
            {eventsFor(date)
              .filter((event) => event.allDay)
              .map((event) => (
                <EventChip
                  key={event.entityId}
                  event={event}
                  timeZone={timeZone}
                />
              ))}
          </div>
        ))}
        {dates.map((date) => (
          <ul
            key={`timed-${date}`}
            className="flex min-h-48 min-w-0 flex-col gap-1 border-t bg-background p-1.5"
          >
            {eventsFor(date)
              .filter((event) => !event.allDay)
              .map((event) => (
                <TimedEvent
                  key={event.entityId}
                  event={event}
                  timeZone={timeZone}
                />
              ))}
          </ul>
        ))}
      </div>
    </div>
  );
};
