// The calendar page: month / week / agenda views switched and anchored
// entirely through URL search params (view + date), plus a read-only
// right-side context panel showing the soonest upcoming event and
// whichever event a view last selected. Data arrives through the narrow
// CalendarApi seam the host registry wires up from its tRPC client;
// every day boundary (and "now", for the panel) is computed server-side
// in the home timezone, and this screen only renders what it gets back.

import { Alert, AlertDescription, Loader2 } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import type {
  AgendaEvent,
  CalendarEventList,
  CalendarRange,
} from "../contract";
import type { CalendarApi } from "./api";
import { CalendarHeader } from "./components/calendar-header";
import { ContextPanel } from "./components/context-panel";
import { EventModal, type EventModalTarget } from "./components/event-modal";
import {
  AGENDA_DAYS,
  type CalendarSearch,
  type CalendarView,
  normalizeCalendarSearch,
  viewWindow,
} from "./helpers/calendar-search";
import { addDays, addMonths, mondayOf } from "./helpers/date-matrix";
import { formatDayRangeLabel, formatMonthLabel } from "./helpers/format";
import { readableError } from "./readable-error";
import { AgendaView } from "./views/agenda-view";
import { ListView } from "./views/list-view";
import { MonthView } from "./views/month-view";
import { WeekView } from "./views/week-view";

/** The context panel's "Next up" card only ever needs the soonest event. */
const UPCOMING_LIMIT = 1;

const rangeLabel = (view: CalendarView, anchor: string): string => {
  if (view === "month" || view === "list") {
    return formatMonthLabel(anchor);
  }
  if (view === "week") {
    const monday = mondayOf(anchor);
    return formatDayRangeLabel(monday, addDays(monday, 6));
  }
  return formatDayRangeLabel(anchor, addDays(anchor, AGENDA_DAYS - 1));
};

/** The anchor one step back or forward: a month/list steps by month, everything else by a week. */
const steppedAnchor = (
  view: CalendarView,
  anchor: string,
  direction: 1 | -1,
): string =>
  view === "month" || view === "list"
    ? addMonths(anchor, direction)
    : addDays(anchor, direction * 7);

const LoadingState = (): ReactElement => (
  <Loader2
    aria-hidden="true"
    className="size-4 animate-spin text-muted-foreground"
  />
);

const CalendarBody = ({
  view,
  anchor,
  today,
  range,
  onOpenDay,
  onCreateOn,
  onSelectEvent,
}: {
  readonly view: CalendarView;
  readonly anchor: string;
  readonly today: string;
  readonly range: CalendarRange;
  readonly onOpenDay: (date: string) => void;
  readonly onCreateOn: (date: string) => void;
  readonly onSelectEvent: (event: AgendaEvent) => void;
}): ReactElement => {
  if (view === "agenda") {
    return (
      <AgendaView
        days={range.days}
        timeZone={range.homeTimezone}
        onSelectEvent={onSelectEvent}
      />
    );
  }
  const eventsByDate = new Map(range.days.map((day) => [day.date, day.events]));
  const grid =
    view === "month" ? (
      <MonthView
        anchor={anchor}
        today={today}
        eventsByDate={eventsByDate}
        timeZone={range.homeTimezone}
        onOpenDay={onOpenDay}
        onCreateOn={onCreateOn}
        onSelectEvent={onSelectEvent}
      />
    ) : (
      <WeekView
        anchor={anchor}
        today={today}
        eventsByDate={eventsByDate}
        timeZone={range.homeTimezone}
        onCreateOn={onCreateOn}
        onSelectEvent={onSelectEvent}
      />
    );
  return (
    <div>
      {grid}
      {range.days.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No events in this {view}. Events appear here after a sync.
        </p>
      ) : null}
    </div>
  );
};

/**
 * Module pages mount into the host's route tree dynamically, so the
 * host's literal route types cannot know this path at compile time; a
 * narrow structural signature keeps navigation typed on the module side.
 */
type CalendarNavigate = (options: {
  readonly to: "/calendar";
  readonly search: CalendarSearch;
}) => Promise<void>;

interface CalendarData {
  /** Today in the home timezone, once the server has answered. */
  readonly today: string | undefined;
  /** The anchor date the views are built around. */
  readonly anchor: string | undefined;
  readonly range: CalendarRange | undefined;
  /** The flat events feed, fetched only for the list view. */
  readonly events: CalendarEventList | undefined;
  /** The soonest future event for the panel's "Next up" card, or null. */
  readonly upcoming: AgendaEvent | null;
  readonly error: Error | null;
}

/**
 * The range (day-grouped) and events (flat) queries are mutually
 * exclusive: every other view needs `range`, the list view needs
 * `events`, and no view needs both, so gating each on `view` avoids
 * fetching data nothing renders.
 */
const useCalendarData = (
  api: CalendarApi,
  view: CalendarView,
  date: string | undefined,
): CalendarData => {
  const todayQuery = useQuery({
    queryKey: ["calendar", "today"],
    queryFn: () => api.today(),
  });
  const today = todayQuery.data?.today;
  // The anchor defaults to today in the HOME timezone, which only the
  // server knows; the client never derives dates from its own clock.
  const anchor = date ?? today;
  const dateWindow =
    anchor === undefined ? undefined : viewWindow(view, anchor);
  const rangeQuery = useQuery({
    queryKey: ["calendar", "range", dateWindow?.from, dateWindow?.to],
    queryFn: () => {
      if (dateWindow === undefined) {
        throw new Error("The calendar window is not ready yet.");
      }
      return api.range(dateWindow.from, dateWindow.to);
    },
    enabled: view !== "list" && dateWindow !== undefined,
  });
  const eventsQuery = useQuery({
    queryKey: ["calendar", "events", dateWindow?.from, dateWindow?.to],
    queryFn: () => {
      if (dateWindow === undefined) {
        throw new Error("The calendar window is not ready yet.");
      }
      return api.events(dateWindow.from, dateWindow.to);
    },
    enabled: view === "list" && dateWindow !== undefined,
  });
  // The panel's own feed, fetched independently of the active view and
  // never folded into the page-level error gate below: a failure here
  // must not hide the calendar, only leave the panel showing "Nothing
  // coming up." instead of the real next event.
  const upcomingQuery = useQuery({
    queryKey: ["calendar", "upcoming", UPCOMING_LIMIT],
    queryFn: () => api.upcoming(UPCOMING_LIMIT),
    enabled: today !== undefined,
  });
  // Only the ACTIVE feed's error counts: a disabled query keeps its last
  // (possibly errored) state frozen, so surfacing the inactive feed's
  // error would strand a freshly loaded view behind a stale alert after a
  // switch, with no in-app recovery.
  const feedError = view === "list" ? eventsQuery.error : rangeQuery.error;
  return {
    today,
    anchor,
    range: rangeQuery.data,
    events: eventsQuery.data,
    upcoming: upcomingQuery.data?.events[0] ?? null,
    error: todayQuery.error ?? feedError,
  };
};

/** Builds the page component around the host-wired calendar queries. */
export const createCalendarScreen = (api: CalendarApi) => {
  const CalendarScreen = (): ReactElement => {
    const rawSearch: unknown = useSearch({ strict: false });
    const { view, date } = normalizeCalendarSearch(rawSearch);
    const navigate = useNavigate() as unknown as CalendarNavigate;
    const { today, anchor, range, events, upcoming, error } = useCalendarData(
      api,
      view,
      date,
    );
    // The list view fetches `events` instead of `range`, so the modal's
    // timezone comes from whichever feed the current view actually
    // loaded (never both, per useCalendarData's mutually exclusive gate).
    const homeTimezone = range?.homeTimezone ?? events?.homeTimezone;
    const [target, setTarget] = useState<EventModalTarget | null>(null);
    // Clicking any event (editable or not) selects it into the panel;
    // editing is now an explicit button there, not a view click.
    const [selected, setSelected] = useState<AgendaEvent | null>(null);

    const setSearch = (next: CalendarSearch): void => {
      void navigate({
        to: "/calendar",
        search: { view: next.view, date: next.date },
      });
    };
    const onCreateOn = (day: string): void =>
      setTarget({ mode: "create", date: day });
    const onEdit = (event: AgendaEvent): void =>
      setTarget({ mode: "edit", event });
    // Avoids a stale selection pointing at an event that no longer exists.
    const clearIfDeleted = (entityId: string): void =>
      setSelected((current) =>
        current?.entityId === entityId ? null : current,
      );

    const body = (): ReactElement => {
      if (error !== null) {
        return (
          <Alert variant="destructive">
            <AlertDescription>{readableError(error)}</AlertDescription>
          </Alert>
        );
      }
      if (anchor === undefined || today === undefined) {
        return <LoadingState />;
      }
      // List renders off the flat events feed, not the day-grouped range,
      // so it gets its own ready-gate ahead of the range-dependent views.
      if (view === "list") {
        if (events === undefined) {
          return <LoadingState />;
        }
        return (
          <ListView
            events={events.events}
            timeZone={events.homeTimezone}
            onSelectEvent={setSelected}
          />
        );
      }
      if (range === undefined) {
        return <LoadingState />;
      }
      return (
        <CalendarBody
          view={view}
          anchor={anchor}
          today={today}
          range={range}
          onOpenDay={(day) => setSearch({ view: "agenda", date: day })}
          onCreateOn={onCreateOn}
          onSelectEvent={setSelected}
        />
      );
    };

    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <CalendarHeader
          label={anchor === undefined ? "" : rangeLabel(view, anchor)}
          view={view}
          onViewChange={(next) => setSearch({ view: next, date })}
          onPrevious={() => {
            if (anchor !== undefined) {
              setSearch({ view, date: steppedAnchor(view, anchor, -1) });
            }
          }}
          onToday={() => setSearch({ view })}
          onNext={() => {
            if (anchor !== undefined) {
              setSearch({ view, date: steppedAnchor(view, anchor, 1) });
            }
          }}
          navDisabled={anchor === undefined}
          onNewEvent={() => {
            if (anchor !== undefined) {
              onCreateOn(anchor);
            }
          }}
        />
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">{body()}</div>
          {homeTimezone === undefined ? null : (
            <aside
              aria-label="Event details"
              className="w-full lg:w-72 lg:shrink-0"
            >
              <ContextPanel
                upcoming={upcoming}
                selected={selected}
                timeZone={homeTimezone}
                onEdit={onEdit}
                onClearSelection={() => setSelected(null)}
              />
            </aside>
          )}
        </div>
        {homeTimezone === undefined ? null : (
          <EventModal
            target={target}
            timeZone={homeTimezone}
            onClose={() => setTarget(null)}
            onCreate={(input) =>
              api.createEvent(input).then(() => setTarget(null))
            }
            onUpdate={(input) =>
              api.updateEvent(input).then(() => setTarget(null))
            }
            onDelete={(entityId) =>
              api.deleteEvent(entityId).then(() => {
                setTarget(null);
                clearIfDeleted(entityId);
              })
            }
          />
        )}
      </div>
    );
  };
  return CalendarScreen;
};
