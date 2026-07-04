// The calendar module's block for the Today page: today's events as a
// dense list, each row linking into the agenda view anchored on today.
// It reuses the module's existing CalendarApi seam (the today anchor
// plus a one-day range window), so no new server procedure is involved.

import { Alert, AlertDescription, Badge, Loader2 } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ComponentType, ReactElement, ReactNode } from "react";
import type { AgendaEvent } from "../contract";
import type { CalendarApi } from "./api";
import { RecurrenceIcon } from "./components/recurrence-icon";
import type { CalendarSearch } from "./helpers/calendar-search";
import { addDays } from "./helpers/date-matrix";
import { formatTime } from "./helpers/format";
import { readableError } from "./readable-error";

/**
 * Module pages mount into the host's route tree dynamically, so the
 * host's literal route types cannot know /calendar at compile time; the
 * narrow structural cast keeps these links typed on the module side
 * (the calendar screen does the same for its navigate calls).
 */
const CalendarLink = Link as unknown as ComponentType<{
  readonly to: "/calendar";
  readonly search: CalendarSearch;
  readonly className?: string;
  readonly children: ReactNode;
}>;

const EventTime = ({
  event,
  timeZone,
}: {
  readonly event: AgendaEvent;
  readonly timeZone: string;
}): ReactElement =>
  event.allDay ? (
    <Badge variant="secondary" className="shrink-0 text-muted-foreground">
      all day
    </Badge>
  ) : (
    <span className="tnum shrink-0 text-sm text-muted-foreground">
      {formatTime(event.start, timeZone)} - {formatTime(event.end, timeZone)}
    </span>
  );

const EventRow = ({
  event,
  today,
  timeZone,
}: {
  readonly event: AgendaEvent;
  readonly today: string;
  readonly timeZone: string;
}): ReactElement => (
  <li>
    <CalendarLink
      to="/calendar"
      search={{ view: "agenda", date: today }}
      className="-mx-2 flex items-baseline gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
    >
      <EventTime event={event} timeZone={timeZone} />
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
    </CalendarLink>
  </li>
);

const SectionBody = ({
  events,
  today,
  timeZone,
}: {
  readonly events: readonly AgendaEvent[];
  readonly today: string;
  readonly timeZone: string;
}): ReactElement => {
  if (events.length === 0) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Nothing scheduled today.
      </p>
    );
  }
  return (
    <ul className="mt-2 flex flex-col gap-0.5">
      {events.map((event) => (
        <EventRow
          key={event.entityId}
          event={event}
          today={today}
          timeZone={timeZone}
        />
      ))}
    </ul>
  );
};

const SectionHeading = (): ReactElement => (
  <div className="flex items-baseline justify-between">
    <h2 className="text-sm font-semibold tracking-tight">Agenda</h2>
    <CalendarLink
      to="/calendar"
      search={{ view: "agenda" }}
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      Open calendar
    </CalendarLink>
  </div>
);

/** Builds the Today-page section around the host-wired calendar queries. */
export const createTodayAgendaSection = (api: CalendarApi) => {
  const TodayAgendaSection = (): ReactElement => {
    const todayQuery = useQuery({
      queryKey: ["calendar", "today"],
      queryFn: () => api.today(),
    });
    const today = todayQuery.data?.today;
    // The same key shape the calendar page uses, so an equal window is
    // served from the shared cache instead of refetching.
    const tomorrow = today === undefined ? undefined : addDays(today, 1);
    const rangeQuery = useQuery({
      queryKey: ["calendar", "range", today, tomorrow],
      queryFn: () => {
        if (today === undefined || tomorrow === undefined) {
          throw new Error("The calendar window is not ready yet.");
        }
        return api.range(today, tomorrow);
      },
      enabled: today !== undefined,
    });

    const body = (): ReactElement => {
      const error = todayQuery.error ?? rangeQuery.error;
      if (error !== null) {
        return (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription>{readableError(error)}</AlertDescription>
          </Alert>
        );
      }
      const range = rangeQuery.data;
      if (today === undefined || range === undefined) {
        return (
          <Loader2
            aria-hidden="true"
            className="mt-2 size-4 animate-spin text-muted-foreground"
          />
        );
      }
      // The one-day window groups into at most a single day entry; the
      // server already ordered it all-day first, then by start time.
      const events = range.days.find((day) => day.date === today)?.events ?? [];
      return (
        <SectionBody
          events={events}
          today={today}
          timeZone={range.homeTimezone}
        />
      );
    };

    return (
      <section aria-label="Agenda">
        <SectionHeading />
        {body()}
      </section>
    );
  };
  return TodayAgendaSection;
};
