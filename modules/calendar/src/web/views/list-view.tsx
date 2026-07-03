// The list view: a flat, client-sortable table of every event in the
// current month window. Unlike the day-grouped range the other views
// use, this reads the module's dedicated events(from,to) feed so a
// multi-day event appears exactly once. User events stay editable via
// T6's modal; Google-synced ones stay read-only, matching every other
// view's discipline.

import type { ReactElement } from "react";
import { useState } from "react";
import type { AgendaEvent } from "../../contract";
import { RecurrenceIcon } from "../components/recurrence-icon";
import {
  formatDateInZone,
  formatDayHeading,
  formatTime,
} from "../helpers/format";
import {
  DEFAULT_SORT,
  type SortColumn,
  type SortState,
  sortEvents,
} from "../helpers/sort-events";

export interface ListViewProps {
  readonly events: readonly AgendaEvent[];
  readonly timeZone: string;
  readonly onEditEvent: (event: AgendaEvent) => void;
}

type AriaSort = "ascending" | "descending" | "none";

const ariaSortOf = (sort: SortState, column: SortColumn): AriaSort => {
  if (sort.column !== column) {
    return "none";
  }
  return sort.direction === "asc" ? "ascending" : "descending";
};

const SortableHeader = ({
  column,
  label,
  sort,
  onSortChange,
}: {
  readonly column: SortColumn;
  readonly label: string;
  readonly sort: SortState;
  readonly onSortChange: (column: SortColumn) => void;
}): ReactElement => {
  const active = sort.column === column;
  return (
    <th
      scope="col"
      aria-sort={ariaSortOf(sort, column)}
      className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
    >
      <button
        type="button"
        onClick={() => onSortChange(column)}
        className="flex items-center gap-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {label}
        {active ? (
          <span aria-hidden="true">{sort.direction === "asc" ? "▲" : "▼"}</span>
        ) : null}
      </button>
    </th>
  );
};

/**
 * User events get the accent dot and become a button that opens T6's
 * edit modal (the same cue EventChip uses); Google events stay plain,
 * inert text with no click affordance.
 */
const TitleCell = ({
  event,
  onEditEvent,
}: {
  readonly event: AgendaEvent;
  readonly onEditEvent: (event: AgendaEvent) => void;
}): ReactElement => {
  const label = (
    <>
      <span className="truncate">{event.title}</span>
      {event.recurring ? <RecurrenceIcon /> : null}
    </>
  );
  if (event.editable) {
    return (
      <button
        type="button"
        onClick={() => onEditEvent(event)}
        className="flex min-w-0 items-center gap-1.5 text-left text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-primary"
        />
        {label}
      </button>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
      {label}
    </span>
  );
};

const Row = ({
  event,
  timeZone,
  onEditEvent,
}: {
  readonly event: AgendaEvent;
  readonly timeZone: string;
  readonly onEditEvent: (event: AgendaEvent) => void;
}): ReactElement => {
  const dateText = formatDayHeading(formatDateInZone(event.start, timeZone));
  const timeText = event.allDay
    ? "All day"
    : `${formatTime(event.start, timeZone)} - ${formatTime(event.end, timeZone)}`;
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">
        <TitleCell event={event} onEditEvent={onEditEvent} />
      </td>
      <td className="px-3 py-2 text-sm text-muted-foreground">{dateText}</td>
      <td className="tnum px-3 py-2 text-sm text-muted-foreground">
        {timeText}
      </td>
      <td className="px-3 py-2 text-sm text-muted-foreground">
        {event.location ?? ""}
      </td>
    </tr>
  );
};

export const ListView = ({
  events,
  timeZone,
  onEditEvent,
}: ListViewProps): ReactElement => {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No events this month.</p>
    );
  }

  const toggleSort = (column: SortColumn): void => {
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" },
    );
  };

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <SortableHeader
              column="title"
              label="Title"
              sort={sort}
              onSortChange={toggleSort}
            />
            <SortableHeader
              column="start"
              label="Date"
              sort={sort}
              onSortChange={toggleSort}
            />
            <th
              scope="col"
              className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
            >
              Time
            </th>
            <SortableHeader
              column="location"
              label="Location"
              sort={sort}
              onSortChange={toggleSort}
            />
          </tr>
        </thead>
        <tbody>
          {sortEvents(events, sort).map((event) => (
            <Row
              key={event.entityId}
              event={event}
              timeZone={timeZone}
              onEditEvent={onEditEvent}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};
