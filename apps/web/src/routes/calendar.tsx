import { Alert, AlertDescription, Badge, Card, Loader2 } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { Agenda, AgendaDay, AgendaEvent } from "../lib/api";
import { useApi } from "../lib/api-context";
import { readableError } from "../lib/errors";

const AGENDA_DAYS = 7;

// The date string is a home-timezone calendar date; formatting it as UTC
// midnight keeps the label on that exact date regardless of the browser's
// own timezone.
const formatDayHeading = (date: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

const formatTime = (epochMs: number, timeZone: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(epochMs);

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
        <span className="block truncate text-sm font-medium">
          {event.title}
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
    <p className="text-sm font-medium">
      No events in the next {AGENDA_DAYS} days.
    </p>
    <p className="text-sm text-muted-foreground">
      Events appear here after a sync. You can run one from Settings.
    </p>
  </Card>
);

const AgendaList = ({ agenda }: { readonly agenda: Agenda }): ReactElement => {
  if (agenda.days.length === 0) {
    return <EmptyState />;
  }
  return (
    <div className="flex flex-col gap-6">
      {agenda.days.map((day) => (
        <DayGroup key={day.date} day={day} timeZone={agenda.homeTimezone} />
      ))}
    </div>
  );
};

export const CalendarScreen = (): ReactElement => {
  const api = useApi();
  const agenda = useQuery({
    queryKey: ["agenda", AGENDA_DAYS],
    queryFn: () => api.agenda(AGENDA_DAYS),
  });

  const body = (): ReactElement => {
    if (agenda.data !== undefined) {
      return <AgendaList agenda={agenda.data} />;
    }
    if (agenda.error !== null) {
      return (
        <Alert variant="destructive">
          <AlertDescription>{readableError(agenda.error)}</AlertDescription>
        </Alert>
      );
    }
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="text-lg font-semibold tracking-tight">Calendar</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The next {AGENDA_DAYS} days across your connected calendars.
      </p>
      <div className="mt-6">{body()}</div>
    </div>
  );
};
