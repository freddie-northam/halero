// The week view: a Monday-Sunday hour-axis time grid. An all-day row sits
// above a scrollable grid of 7 day columns, each 24 hours tall; timed
// events are absolutely positioned within their column by minutes-of-day
// (never by offset arithmetic on the epoch -- see minutesOfDayInZone).
// Overlapping timed events sit side by side via packEventLanes.

import { cn, Plus } from "@halero/ui";
import type { CSSProperties, ReactElement } from "react";
import type { AgendaEvent } from "../../contract";
import { EventChip } from "../components/event-chip";
import { RecurrenceIcon } from "../components/recurrence-icon";
import { weekDates } from "../helpers/date-matrix";
import {
  dayOfMonth,
  formatDateInZone,
  formatTime,
  formatWeekdayShort,
  minutesOfDayInZone,
} from "../helpers/format";
import { type PackedSlot, packEventLanes } from "../helpers/layout";

export interface WeekViewProps {
  /** Any date inside the week on display. */
  readonly anchor: string;
  /** Today in the home timezone; its column header gets the accent ring. */
  readonly today: string;
  readonly eventsByDate: ReadonlyMap<string, readonly AgendaEvent[]>;
  readonly timeZone: string;
  /** The per-day "+" create affordance opens the create modal on that day. */
  readonly onCreateOn: (date: string) => void;
  /** Any event click selects it into the context panel. */
  readonly onSelectEvent: (event: AgendaEvent) => void;
}

/** Exported so tests can compute the exact pixel offsets they expect. */
export const HOUR_ROW_HEIGHT_PX = 48;
const MINUTES_PER_DAY = 24 * 60;
const GRID_HEIGHT_PX = HOUR_ROW_HEIGHT_PX * 24;
/** Keeps very short events (e.g. 15 minutes) legible. */
const MIN_BLOCK_HEIGHT_PX = 18;
/** A tiny visual gap between side-by-side lanes, in percent. */
const LANE_GAP_PERCENT = 2;
/** A fixed left axis column plus 7 equal-width day columns. */
const GRID_COLUMNS = "grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const hourLabel = (hour: number): string =>
  `${String(hour).padStart(2, "0")}:00`;

const HourGridLines = (): ReactElement => (
  <>
    {HOURS.map((hour) => (
      <div
        key={hour}
        aria-hidden="true"
        style={{ height: HOUR_ROW_HEIGHT_PX }}
        className="border-b"
      />
    ))}
  </>
);

const HourAxis = (): ReactElement => (
  <div className="relative bg-background">
    {HOURS.map((hour) => (
      <div
        key={hour}
        style={{ height: HOUR_ROW_HEIGHT_PX }}
        className="tnum border-b px-1.5 pt-0.5 text-right text-[11px] text-muted-foreground"
      >
        {hourLabel(hour)}
      </div>
    ))}
  </div>
);

const DayHeader = ({
  date,
  isToday,
  onCreateOn,
}: {
  readonly date: string;
  readonly isToday: boolean;
  readonly onCreateOn: (date: string) => void;
}): ReactElement => (
  <div
    aria-current={isToday ? "date" : undefined}
    className={cn(
      "group flex items-center justify-between gap-1.5 bg-background px-2 py-1.5",
      isToday && "ring-1 ring-ring ring-inset",
    )}
  >
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {formatWeekdayShort(date)}
      </span>
      <span
        className={cn("tnum text-sm font-medium", isToday && "text-primary")}
      >
        {dayOfMonth(date)}
      </span>
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

const AllDayCell = ({
  events,
  timeZone,
  onSelectEvent,
}: {
  readonly events: readonly AgendaEvent[];
  readonly timeZone: string;
  readonly onSelectEvent: (event: AgendaEvent) => void;
}): ReactElement => (
  <div className="flex min-h-7 min-w-0 flex-col gap-px bg-background p-1">
    {events.map((event) => (
      <EventChip
        key={event.entityId}
        event={event}
        timeZone={timeZone}
        onSelect={onSelectEvent}
      />
    ))}
  </div>
);

const AllDayRow = ({
  dates,
  eventsFor,
  timeZone,
  onSelectEvent,
}: {
  readonly dates: readonly string[];
  readonly eventsFor: (date: string) => readonly AgendaEvent[];
  readonly timeZone: string;
  readonly onSelectEvent: (event: AgendaEvent) => void;
}): ReactElement => (
  <div className={cn("grid gap-px border-b bg-border", GRID_COLUMNS)}>
    <div className="bg-background px-1.5 py-1 text-[11px] text-muted-foreground">
      All day
    </div>
    {dates.map((date) => (
      <AllDayCell
        key={date}
        events={eventsFor(date).filter((event) => event.allDay)}
        timeZone={timeZone}
        onSelectEvent={onSelectEvent}
      />
    ))}
  </div>
);

const HeaderRow = ({
  dates,
  today,
  onCreateOn,
}: {
  readonly dates: readonly string[];
  readonly today: string;
  readonly onCreateOn: (date: string) => void;
}): ReactElement => (
  <div className={cn("grid gap-px border-b bg-border", GRID_COLUMNS)}>
    <div className="bg-background" />
    {dates.map((date) => (
      <DayHeader
        key={date}
        date={date}
        isToday={date === today}
        onCreateOn={onCreateOn}
      />
    ))}
  </div>
);

const TimedGrid = ({
  dates,
  eventsFor,
  timeZone,
  onSelectEvent,
}: {
  readonly dates: readonly string[];
  readonly eventsFor: (date: string) => readonly AgendaEvent[];
  readonly timeZone: string;
  readonly onSelectEvent: (event: AgendaEvent) => void;
}): ReactElement => (
  <div className="max-h-[65vh] overflow-y-auto">
    <div className={cn("grid gap-px bg-border", GRID_COLUMNS)}>
      <HourAxis />
      {dates.map((date) => (
        <DayColumn
          key={date}
          date={date}
          events={eventsFor(date)}
          timeZone={timeZone}
          onSelectEvent={onSelectEvent}
        />
      ))}
    </div>
  </div>
);

interface TimedLayout {
  readonly top: number;
  readonly height: number;
  readonly left: number;
  readonly width: number;
}

/** An event's minute span WITHIN one day column, both in 0..1440. */
interface DayMinutes {
  readonly start: number;
  readonly end: number;
}

/**
 * The event's [start, end) minute span clamped to a single day column, so
 * an event that crosses local midnight (only connector events can, since
 * user events are same-day) sits at the bottom of the day it starts and
 * the top of the day it continues into, instead of both days repeating the
 * start day's minutes. Dates are compared, and minutes read, only through
 * the server-timezone formatters, never by offset arithmetic on the epoch.
 */
const dayMinutes = (
  event: AgendaEvent,
  date: string,
  timeZone: string,
): DayMinutes => ({
  start:
    formatDateInZone(event.start, timeZone) < date
      ? 0
      : minutesOfDayInZone(event.start, timeZone),
  end:
    formatDateInZone(event.end, timeZone) > date
      ? MINUTES_PER_DAY
      : minutesOfDayInZone(event.end, timeZone),
});

/**
 * Pixel top/height come from the clamped day minutes; percent left/width
 * come from the event's packed lane (packed over the same clamped ranges,
 * so overlaps on a continuation day are correct).
 */
const timedLayout = (range: DayMinutes, slot: PackedSlot): TimedLayout => {
  const height = Math.min(
    GRID_HEIGHT_PX,
    Math.max(
      MIN_BLOCK_HEIGHT_PX,
      ((range.end - range.start) / MINUTES_PER_DAY) * GRID_HEIGHT_PX,
    ),
  );
  // Clamp the top so a short event late in the day stays legible AND
  // within the grid: its bottom never spills past the final hour row.
  const top = Math.min(
    (range.start / MINUTES_PER_DAY) * GRID_HEIGHT_PX,
    GRID_HEIGHT_PX - height,
  );
  const laneWidth = 100 / slot.laneCount;
  const gap = slot.laneCount > 1 ? LANE_GAP_PERCENT : 0;
  return {
    top,
    height,
    left: slot.lane * laneWidth,
    width: laneWidth - gap,
  };
};

const timedBlockClassName = (editable: boolean): string =>
  cn(
    "absolute overflow-hidden rounded-sm border-l-2 px-1 py-0.5 text-left text-xs leading-tight",
    editable
      ? "border-l-primary bg-primary/10"
      : "border-l-transparent bg-muted",
  );

const TimedBlockLabel = ({
  event,
  timeZone,
}: {
  readonly event: AgendaEvent;
  readonly timeZone: string;
}): ReactElement => (
  <>
    <span className="tnum block truncate text-[11px] text-muted-foreground">
      {formatTime(event.start, timeZone)}
    </span>
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate font-medium">{event.title}</span>
      {event.recurring ? <RecurrenceIcon /> : null}
    </span>
  </>
);

/**
 * Every timed block is a keyboard-focusable button that selects the
 * event into the context panel; the accent border still distinguishes
 * editable (user) events from Google ones at a glance.
 */
const TimedBlock = ({
  event,
  timeZone,
  layout,
  onSelectEvent,
}: {
  readonly event: AgendaEvent;
  readonly timeZone: string;
  readonly layout: TimedLayout;
  readonly onSelectEvent: (event: AgendaEvent) => void;
}): ReactElement => {
  const style: CSSProperties = {
    top: layout.top,
    height: layout.height,
    left: `${layout.left}%`,
    width: `${layout.width}%`,
  };
  return (
    <button
      type="button"
      style={style}
      title={event.title}
      onClick={() => onSelectEvent(event)}
      className={cn(
        timedBlockClassName(event.editable),
        "w-full focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
      )}
    >
      <TimedBlockLabel event={event} timeZone={timeZone} />
    </button>
  );
};

const DayColumn = ({
  date,
  events,
  timeZone,
  onSelectEvent,
}: {
  readonly date: string;
  readonly events: readonly AgendaEvent[];
  readonly timeZone: string;
  readonly onSelectEvent: (event: AgendaEvent) => void;
}): ReactElement => {
  const timed = events.filter((event) => !event.allDay);
  const ranges = timed.map((event) => dayMinutes(event, date, timeZone));
  const slots = packEventLanes(ranges);
  return (
    <div
      className="relative min-w-0 bg-background"
      style={{ height: GRID_HEIGHT_PX }}
    >
      <HourGridLines />
      {timed.map((event, index) => (
        <TimedBlock
          key={event.entityId}
          event={event}
          timeZone={timeZone}
          layout={timedLayout(
            ranges[index] ?? { start: 0, end: 0 },
            slots[index] ?? { lane: 0, laneCount: 1 },
          )}
          onSelectEvent={onSelectEvent}
        />
      ))}
    </div>
  );
};

export const WeekView = ({
  anchor,
  today,
  eventsByDate,
  timeZone,
  onCreateOn,
  onSelectEvent,
}: WeekViewProps): ReactElement => {
  const dates = weekDates(anchor);
  const eventsFor = (date: string): readonly AgendaEvent[] =>
    eventsByDate.get(date) ?? [];
  return (
    <div className="overflow-hidden rounded-md border">
      <HeaderRow dates={dates} today={today} onCreateOn={onCreateOn} />
      <AllDayRow
        dates={dates}
        eventsFor={eventsFor}
        timeZone={timeZone}
        onSelectEvent={onSelectEvent}
      />
      <TimedGrid
        dates={dates}
        eventsFor={eventsFor}
        timeZone={timeZone}
        onSelectEvent={onSelectEvent}
      />
    </div>
  );
};
