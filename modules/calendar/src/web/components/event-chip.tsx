import { cn } from "@halero/ui";
import type { ReactElement } from "react";
import type { AgendaEvent } from "../../contract";
import { formatTime } from "../helpers/format";
import { RecurrenceIcon } from "./recurrence-icon";

export interface EventChipProps {
  readonly event: AgendaEvent;
  readonly timeZone: string;
}

/**
 * A one-line event marker for grid cells: all-day events get the tinted
 * accent chip, timed events lead with their start time in tabular
 * numerals.
 */
export const EventChip = ({
  event,
  timeZone,
}: EventChipProps): ReactElement => (
  <div
    className={cn(
      "flex min-w-0 items-center gap-1 rounded-sm px-1 text-xs leading-4",
      event.allDay ? "bg-primary/10 text-primary" : "text-foreground",
    )}
    title={event.title}
  >
    {event.allDay ? null : (
      <span className="tnum shrink-0 text-muted-foreground">
        {formatTime(event.start, timeZone)}
      </span>
    )}
    <span className="truncate">{event.title}</span>
    {event.recurring ? <RecurrenceIcon /> : null}
  </div>
);
