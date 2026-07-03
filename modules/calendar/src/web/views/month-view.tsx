// The month view: a fixed 6x7 Monday-start grid. Cells only ARRANGE the
// dates; which events land on which day comes entirely from the server's
// home-timezone range grouping.

import { cn, Plus } from "@halero/ui";
import type { ReactElement } from "react";
import type { AgendaEvent } from "../../contract";
import { EventChip } from "../components/event-chip";
import { monthMatrix, monthOf } from "../helpers/date-matrix";
import { dayOfMonth, formatWeekdayShort } from "../helpers/format";

export interface MonthViewProps {
  /** Any date inside the month on display. */
  readonly anchor: string;
  /** Today in the home timezone; its cell gets the accent ring. */
  readonly today: string;
  readonly eventsByDate: ReadonlyMap<string, readonly AgendaEvent[]>;
  readonly timeZone: string;
  /** "+N more" hands off to that day's agenda. */
  readonly onOpenDay: (date: string) => void;
  /** The per-cell "add event" affordance opens the create modal on that day. */
  readonly onCreateOn: (date: string) => void;
  /** Any event chip click selects it into the context panel. */
  readonly onSelectEvent: (event: AgendaEvent) => void;
}

/** Up to this many chips per cell before the "+N more" affordance. */
const MAX_CHIPS = 3;

const DayHeading = ({
  date,
  inMonth,
  isToday,
  onCreateOn,
}: {
  readonly date: string;
  readonly inMonth: boolean;
  readonly isToday: boolean;
  readonly onCreateOn: (date: string) => void;
}): ReactElement => (
  <div className="flex items-center justify-between">
    <span
      className={cn(
        "tnum px-1 text-xs",
        inMonth ? "text-foreground" : "text-muted-foreground",
        isToday && "font-semibold text-primary",
      )}
    >
      {dayOfMonth(date)}
    </span>
    <button
      type="button"
      aria-label={`Add event on ${date}`}
      onClick={() => onCreateOn(date)}
      className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none group-hover:opacity-100 group-focus-within:opacity-100"
    >
      <Plus className="size-3" aria-hidden="true" />
    </button>
  </div>
);

const DayCell = ({
  date,
  inMonth,
  isToday,
  events,
  timeZone,
  onOpenDay,
  onCreateOn,
  onSelectEvent,
}: {
  readonly date: string;
  readonly inMonth: boolean;
  readonly isToday: boolean;
  readonly events: readonly AgendaEvent[];
  readonly timeZone: string;
  readonly onOpenDay: (date: string) => void;
  readonly onCreateOn: (date: string) => void;
  readonly onSelectEvent: (event: AgendaEvent) => void;
}): ReactElement => {
  const overflow = events.length - MAX_CHIPS;
  return (
    <div
      aria-current={isToday ? "date" : undefined}
      className={cn(
        "group flex min-h-24 min-w-0 flex-col gap-0.5 bg-background p-1",
        !inMonth && "bg-muted/40",
        isToday && "ring-1 ring-ring ring-inset",
      )}
    >
      <DayHeading
        date={date}
        inMonth={inMonth}
        isToday={isToday}
        onCreateOn={onCreateOn}
      />
      {events.slice(0, MAX_CHIPS).map((event) => (
        <EventChip
          key={event.entityId}
          event={event}
          timeZone={timeZone}
          onSelect={onSelectEvent}
        />
      ))}
      {overflow > 0 ? (
        <button
          type="button"
          onClick={() => onOpenDay(date)}
          className="rounded-sm px-1 text-left text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          +{overflow} more
        </button>
      ) : null}
    </div>
  );
};

export const MonthView = ({
  anchor,
  today,
  eventsByDate,
  timeZone,
  onOpenDay,
  onCreateOn,
  onSelectEvent,
}: MonthViewProps): ReactElement => {
  const matrix = monthMatrix(anchor);
  const month = monthOf(anchor);
  const firstWeek = matrix[0] ?? [];
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="grid grid-cols-7 gap-px border-b bg-border">
        {firstWeek.map((date) => (
          <div
            key={date}
            className="bg-background px-2 py-1 text-xs font-medium text-muted-foreground"
          >
            {formatWeekdayShort(date)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border">
        {matrix.flat().map((date) => (
          <DayCell
            key={date}
            date={date}
            inMonth={monthOf(date) === month}
            isToday={date === today}
            events={eventsByDate.get(date) ?? []}
            timeZone={timeZone}
            onOpenDay={onOpenDay}
            onCreateOn={onCreateOn}
            onSelectEvent={onSelectEvent}
          />
        ))}
      </div>
    </div>
  );
};
