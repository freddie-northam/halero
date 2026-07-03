// The calendar module's web entry: nav and page contributions. The host
// registry supplies the CalendarApi implementation (backed by
// modules.calendar.today and modules.calendar.range on its tRPC client);
// everything else is self-contained module code composing @halero/ui.

import { defineWebModule, type WebModule } from "@halero/module-sdk/web";
import { CALENDAR_EVENT_KIND } from "@halero/schemas";
import { type CalendarApi, createCalendarScreen } from "./calendar-screen";
import { normalizeCalendarSearch } from "./helpers/calendar-search";

export type {
  Agenda,
  AgendaDay,
  AgendaEvent,
  CalendarRange,
  CalendarToday,
} from "../contract";
export type { CalendarApi } from "./calendar-screen";
export { createTodayAgendaSection } from "./today-agenda-section";

export const createCalendarWebModule = (api: CalendarApi): WebModule =>
  defineWebModule({
    id: "calendar",
    nav: [
      { label: "Calendar", path: "/calendar", order: 20, icon: "calendar" },
    ],
    pages: [
      {
        path: "/calendar",
        component: createCalendarScreen(api),
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
