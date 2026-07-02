// The calendar page: month / week / agenda views switched and anchored
// entirely through URL search params (view + date). Data arrives through
// the narrow CalendarApi seam the host registry wires up from its tRPC
// client; every day boundary is computed server-side in the home
// timezone and this screen only renders the groups it gets back.

import { Alert, AlertDescription, Loader2 } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ReactElement } from "react";
import type { CalendarRange, CalendarToday } from "../contract";
import { CalendarHeader } from "./components/calendar-header";
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
import { MonthView } from "./views/month-view";
import { WeekView } from "./views/week-view";

/** What the calendar page needs from the host: its own module queries. */
export interface CalendarApi {
  readonly today: () => Promise<CalendarToday>;
  readonly range: (from: string, to: string) => Promise<CalendarRange>;
}

const rangeLabel = (view: CalendarView, anchor: string): string => {
  if (view === "month") {
    return formatMonthLabel(anchor);
  }
  if (view === "week") {
    const monday = mondayOf(anchor);
    return formatDayRangeLabel(monday, addDays(monday, 6));
  }
  return formatDayRangeLabel(anchor, addDays(anchor, AGENDA_DAYS - 1));
};

/** The anchor one step back or forward: a month or a week. */
const steppedAnchor = (
  view: CalendarView,
  anchor: string,
  direction: 1 | -1,
): string =>
  view === "month"
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
}: {
  readonly view: CalendarView;
  readonly anchor: string;
  readonly today: string;
  readonly range: CalendarRange;
  readonly onOpenDay: (date: string) => void;
}): ReactElement => {
  if (view === "agenda") {
    return <AgendaView days={range.days} timeZone={range.homeTimezone} />;
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
      />
    ) : (
      <WeekView
        anchor={anchor}
        today={today}
        eventsByDate={eventsByDate}
        timeZone={range.homeTimezone}
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
  readonly error: Error | null;
}

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
    enabled: dateWindow !== undefined,
  });
  return {
    today,
    anchor,
    range: rangeQuery.data,
    error: todayQuery.error ?? rangeQuery.error,
  };
};

/** Builds the page component around the host-wired calendar queries. */
export const createCalendarScreen = (api: CalendarApi) => {
  const CalendarScreen = (): ReactElement => {
    const rawSearch: unknown = useSearch({ strict: false });
    const { view, date } = normalizeCalendarSearch(rawSearch);
    const navigate = useNavigate() as unknown as CalendarNavigate;
    const { today, anchor, range, error } = useCalendarData(api, view, date);

    const setSearch = (next: CalendarSearch): void => {
      void navigate({
        to: "/calendar",
        search: { view: next.view, date: next.date },
      });
    };

    const body = (): ReactElement => {
      if (error !== null) {
        return (
          <Alert variant="destructive">
            <AlertDescription>{readableError(error)}</AlertDescription>
          </Alert>
        );
      }
      if (anchor === undefined || today === undefined || range === undefined) {
        return <LoadingState />;
      }
      return (
        <CalendarBody
          view={view}
          anchor={anchor}
          today={today}
          range={range}
          onOpenDay={(day) => setSearch({ view: "agenda", date: day })}
        />
      );
    };

    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-6">
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
        />
        <div className="mt-4">{body()}</div>
      </div>
    );
  };
  return CalendarScreen;
};
