// The read-only right-side context panel: a "Next up" card for the
// soonest future event (the server's upcoming query) and the details of
// whichever event a view last selected. Its only write path is the Edit
// button, which opens the existing EventModal; there is no delete here
// (delete stays in the modal). The panel does no clock or timezone math
// of its own: every date/time comes from an event's epoch fields plus
// the server-provided home timezone.

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  X,
} from "@halero/ui";
import type { ReactElement, ReactNode } from "react";
import type { AgendaEvent } from "../../contract";
import {
  formatDateInZone,
  formatDayHeading,
  formatDuration,
  formatTime,
} from "../helpers/format";

export interface ContextPanelProps {
  /** The soonest future event, or null when nothing is upcoming. */
  readonly upcoming: AgendaEvent | null;
  /** The event a view's click last selected, or null when none is. */
  readonly selected: AgendaEvent | null;
  readonly timeZone: string;
  /** Opens the event in the edit modal; called only for editable events. */
  readonly onEdit: (event: AgendaEvent) => void;
  readonly onClearSelection: () => void;
  /** Host slot: renders the selected event's relationships. */
  readonly renderRelated?: (entityId: string) => ReactNode;
}

/** The accent dot matches the chips' cue; the label spells it out. */
const SourceCue = ({
  event,
}: {
  readonly event: AgendaEvent;
}): ReactElement => (
  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
    {event.editable ? (
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full bg-primary"
      />
    ) : null}
    {event.editable ? "You" : "Google"}
  </span>
);

const EventWhen = ({
  event,
  timeZone,
}: {
  readonly event: AgendaEvent;
  readonly timeZone: string;
}): ReactElement => {
  const dateText = formatDayHeading(formatDateInZone(event.start, timeZone));
  const timeText = event.allDay
    ? "All day"
    : `${formatTime(event.start, timeZone)} - ${formatTime(event.end, timeZone)}`;
  const duration = event.allDay ? "" : formatDuration(event.start, event.end);
  return (
    <div className="text-sm">
      <p>{dateText}</p>
      <p className="tnum text-muted-foreground">
        {timeText}
        {duration === "" ? "" : ` (${duration})`}
      </p>
    </div>
  );
};

/** Renders one event read-only: title, source, when, location, link, and
 * notes, plus an Edit button for editable events only. */
export const EventDetails = ({
  event,
  timeZone,
  onEdit,
}: {
  readonly event: AgendaEvent;
  readonly timeZone: string;
  readonly onEdit: (event: AgendaEvent) => void;
}): ReactElement => (
  <div className="flex flex-col gap-2">
    <div className="flex items-start justify-between gap-2">
      <h3 className="min-w-0 truncate text-sm font-medium">{event.title}</h3>
      {event.editable ? (
        <Button size="sm" variant="outline" onClick={() => onEdit(event)}>
          Edit
        </Button>
      ) : null}
    </div>
    <SourceCue event={event} />
    <EventWhen event={event} timeZone={timeZone} />
    {event.location === null || event.location === "" ? null : (
      <p className="text-sm text-muted-foreground">{event.location}</p>
    )}
    {event.url === null || event.url === "" ? null : (
      <a
        href={event.url}
        target="_blank"
        rel="noreferrer noopener"
        className="block truncate text-sm text-primary hover:underline"
      >
        {event.url}
      </a>
    )}
    {event.notes === null || event.notes === "" ? null : (
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
        {event.notes}
      </p>
    )}
  </div>
);

const NextUpSection = ({
  upcoming,
  timeZone,
  onEdit,
}: {
  readonly upcoming: AgendaEvent | null;
  readonly timeZone: string;
  readonly onEdit: (event: AgendaEvent) => void;
}): ReactElement => (
  <Card className="gap-2 rounded-xl py-3">
    <CardHeader>
      <CardTitle className="text-sm">Next up</CardTitle>
    </CardHeader>
    <CardContent>
      {upcoming === null ? (
        <p className="text-sm text-muted-foreground">Nothing coming up.</p>
      ) : (
        <EventDetails event={upcoming} timeZone={timeZone} onEdit={onEdit} />
      )}
    </CardContent>
  </Card>
);

/** Omitted entirely when nothing is selected, per the panel's spec. */
const SelectedSection = ({
  selected,
  timeZone,
  onEdit,
  onClearSelection,
  renderRelated,
}: {
  readonly selected: AgendaEvent | null;
  readonly timeZone: string;
  readonly onEdit: (event: AgendaEvent) => void;
  readonly onClearSelection: () => void;
  readonly renderRelated?: (entityId: string) => ReactNode;
}): ReactElement | null => {
  if (selected === null) {
    return null;
  }
  return (
    <Card className="gap-2 rounded-xl py-3">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">Selected</CardTitle>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Clear selection"
          onClick={onClearSelection}
        >
          <X />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <EventDetails event={selected} timeZone={timeZone} onEdit={onEdit} />
        {renderRelated ? (
          <div className="border-t pt-3">
            {renderRelated(selected.entityId)}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export const ContextPanel = ({
  upcoming,
  selected,
  timeZone,
  onEdit,
  onClearSelection,
  renderRelated,
}: ContextPanelProps): ReactElement => (
  <div className="flex flex-col gap-4">
    <NextUpSection upcoming={upcoming} timeZone={timeZone} onEdit={onEdit} />
    <SelectedSection
      selected={selected}
      timeZone={timeZone}
      onEdit={onEdit}
      onClearSelection={onClearSelection}
      renderRelated={renderRelated}
    />
  </div>
);
