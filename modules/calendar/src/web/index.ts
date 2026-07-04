// The calendar module's web entry: nav and page contributions. The host
// registry supplies the CalendarApi implementation (backed by
// modules.calendar.today and modules.calendar.range on its tRPC client);
// everything else is self-contained module code composing @halero/ui.

import { defineWebModule, type WebModule } from "@halero/module-sdk/web";
import { CALENDAR_EVENT_KIND } from "@halero/schemas";
import type { ReactNode } from "react";
import type { CalendarApi } from "./api";
import { createCalendarScreen } from "./calendar-screen";
import { normalizeCalendarSearch } from "./helpers/calendar-search";

export type {
  Agenda,
  AgendaDay,
  AgendaEvent,
  CalendarEventList,
  CalendarRange,
  CalendarToday,
  CalendarUpcoming,
} from "../contract";
export type {
  CalendarApi,
  CalendarEventInput,
  CalendarEventUpdateInput,
} from "./api";
export { withCalendarInvalidation } from "./queries";
export { createTodayAgendaSection } from "./today-agenda-section";

export interface CalendarWebModuleOptions {
  /** Host slot: renders a selected event's relationships in the panel. */
  readonly renderRelated?: (entityId: string) => ReactNode;
}

export const createCalendarWebModule = (
  api: CalendarApi,
  options: CalendarWebModuleOptions = {},
): WebModule =>
  defineWebModule({
    id: "calendar",
    nav: [
      { label: "Calendar", path: "/calendar", order: 20, icon: "calendar" },
    ],
    pages: [
      {
        path: "/calendar",
        component: createCalendarScreen(api, options.renderRelated),
        validateSearch: normalizeCalendarSearch,
      },
    ],
    entityLinks: [
      {
        kind: CALENDAR_EVENT_KIND,
        label: "Event",
        // A dated hit lands on the agenda anchored at its home-timezone
        // date; an undated one falls back to today's agenda.
        buildLink: (hit) => {
          const search: Readonly<Record<string, string>> =
            hit.occurredDate === null
              ? { view: "agenda" }
              : { view: "agenda", date: hit.occurredDate };
          return { path: "/calendar", search };
        },
      },
    ],
  });
