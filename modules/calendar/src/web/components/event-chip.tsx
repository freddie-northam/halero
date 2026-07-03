import { cn } from "@halero/ui";
import type { MouseEvent, ReactElement } from "react";
import type { AgendaEvent } from "../../contract";
import { formatTime } from "../helpers/format";
import { RecurrenceIcon } from "./recurrence-icon";

export interface EventChipProps {
  readonly event: AgendaEvent;
  readonly timeZone: string;
  /** Only called for editable (user) events; Google events stay inert. */
  readonly onEdit?: (event: AgendaEvent) => void;
}

const chipClassName = (event: AgendaEvent): string =>
  cn(
    "flex min-w-0 items-center gap-1 rounded-sm px-1 text-xs leading-4",
    event.allDay ? "bg-primary/10 text-primary" : "text-foreground",
  );

/**
 * User-created events get a small leading accent dot so they read as
 * distinct from Google-synced ones at a glance, on top of the timed/
 * all-day styling both already share.
 */
const ChipContent = ({
  event,
  timeZone,
}: {
  readonly event: AgendaEvent;
  readonly timeZone: string;
}): ReactElement => (
  <>
    {event.editable ? (
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full bg-primary"
      />
    ) : null}
    {event.allDay ? null : (
      <span className="tnum shrink-0 text-muted-foreground">
        {formatTime(event.start, timeZone)}
      </span>
    )}
    <span className="truncate">{event.title}</span>
    {event.recurring ? <RecurrenceIcon /> : null}
  </>
);

/**
 * A one-line event marker for grid cells: all-day events get the tinted
 * accent chip, timed events lead with their start time in tabular
 * numerals. Editable (user) events become a button that opens the edit
 * modal, stopping propagation so it never also triggers the day's create
 * affordance; Google events stay the original static, inert div (their
 * read-only context panel is a later task).
 */
export const EventChip = ({
  event,
  timeZone,
  onEdit,
}: EventChipProps): ReactElement => {
  if (event.editable && onEdit !== undefined) {
    const handleClick = (domEvent: MouseEvent<HTMLButtonElement>): void => {
      domEvent.stopPropagation();
      onEdit(event);
    };
    return (
      <button
        type="button"
        onClick={handleClick}
        title={event.title}
        className={cn(
          chipClassName(event),
          "w-full text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        )}
      >
        <ChipContent event={event} timeZone={timeZone} />
      </button>
    );
  }
  return (
    <div className={chipClassName(event)} title={event.title}>
      <ChipContent event={event} timeZone={timeZone} />
    </div>
  );
};
