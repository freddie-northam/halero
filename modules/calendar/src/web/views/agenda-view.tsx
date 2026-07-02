// The agenda view: a readable day-by-day list of the 7 days from the
// anchor. Multi-day events appear under every day they cover, matching
// the month and week views (the server's range grouping decides).

import { Badge, Card } from "@halero/ui";
import type { ReactElement } from "react";
import type { AgendaDay, AgendaEvent } from "../../contract";
import { RecurrenceIcon } from "../components/recurrence-icon";
import { formatDayHeading, formatTime } from "../helpers/format";

export interface AgendaViewProps {
  readonly days: readonly AgendaDay[];
  readonly timeZone: string;
}

const EventRow = ({
  event,
  timeZone,
}: {
  readonly event: AgendaEvent;
  readonly timeZone: string;
}): ReactElement => (
  <li>
    <Card className="flex-row items-baseline gap-3 rounded-xl px-3 py-2">
      {event.allDay ? (
        <Badge variant="secondary" className="shrink-0 text-muted-foreground">
          all day
        </Badge>
      ) : (
        <span className="tnum shrink-0 text-sm text-muted-foreground">
          {formatTime(event.start, timeZone)} -{" "}
          {formatTime(event.end, timeZone)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{event.title}</span>
          {event.recurring ? <RecurrenceIcon /> : null}
        </span>
        {event.location === null ? null : (
          <span className="block truncate text-xs text-muted-foreground">
            {event.location}
          </span>
        )}
      </span>
    </Card>
  </li>
);

const DayGroup = ({
  day,
  timeZone,
}: {
  readonly day: AgendaDay;
  readonly timeZone: string;
}): ReactElement => (
  <section>
    <h2 className="text-sm font-semibold tracking-tight">
      {formatDayHeading(day.date)}
    </h2>
    <ul className="mt-2 flex flex-col gap-1.5">
      {day.events.map((event) => (
        <EventRow key={event.entityId} event={event} timeZone={timeZone} />
      ))}
    </ul>
  </section>
);

const EmptyState = (): ReactElement => (
  <Card className="gap-1 px-4 py-8 text-center">
    <p className="text-sm font-medium">No events in these 7 days.</p>
    <p className="text-sm text-muted-foreground">
      Events appear here after a sync. You can run one from Settings.
    </p>
  </Card>
);

export const AgendaView = ({
  days,
  timeZone,
}: AgendaViewProps): ReactElement => {
  if (days.length === 0) {
    return (
      <div className="max-w-2xl">
        <EmptyState />
      </div>
    );
  }
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {days.map((day) => (
        <DayGroup key={day.date} day={day} timeZone={timeZone} />
      ))}
    </div>
  );
};
