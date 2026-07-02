// The /calendar URL is the view state: ?view=month|week|agenda and
// ?date=YYYY-MM-DD (the anchor). This normalizer runs both as the route's
// TanStack validateSearch and inside the screen, so a hand-typed or stale
// URL always lands on something renderable instead of erroring.

import { addDays, isCalendarDate, mondayOf, monthMatrix } from "./date-matrix";

export type CalendarView = "month" | "week" | "agenda";

export type CalendarSearch = {
  readonly view: CalendarView;
  /** Anchor date; omitted means "today in the home timezone". */
  readonly date?: string;
};

/** How many days the agenda view shows from its anchor. */
export const AGENDA_DAYS = 7;

const isCalendarView = (value: unknown): value is CalendarView =>
  value === "month" || value === "week" || value === "agenda";

/** Drops anything unrenderable; unknown params never survive. */
export const normalizeCalendarSearch = (search: unknown): CalendarSearch => {
  if (typeof search !== "object" || search === null) {
    return { view: "agenda" };
  }
  const record = search as Record<string, unknown>;
  const view = isCalendarView(record.view) ? record.view : "agenda";
  const date = record.date;
  if (typeof date === "string" && isCalendarDate(date)) {
    return { view, date };
  }
  return { view };
};

export interface DateWindow {
  readonly from: string;
  /** Exclusive, matching the server's half-open range query. */
  readonly to: string;
}

/** The half-open date window a view needs the server to group. */
export const viewWindow = (view: CalendarView, anchor: string): DateWindow => {
  if (view === "agenda") {
    return { from: anchor, to: addDays(anchor, AGENDA_DAYS) };
  }
  if (view === "week") {
    const monday = mondayOf(anchor);
    return { from: monday, to: addDays(monday, 7) };
  }
  const matrix = monthMatrix(anchor);
  const first = matrix[0]?.[0] ?? anchor;
  const last = matrix[5]?.[6] ?? anchor;
  return { from: first, to: addDays(last, 1) };
};
