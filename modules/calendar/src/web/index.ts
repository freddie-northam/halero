// The calendar module's web entry: nav and page contributions. The host
// registry supplies the CalendarApi implementation (backed by
// modules.calendar.today and modules.calendar.range on its tRPC client);
// everything else is self-contained module code composing @halero/ui.

import { defineWebModule, type WebModule } from "@halero/module-sdk/web";
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

export const createCalendarWebModule = (api: CalendarApi): WebModule =>
  defineWebModule({
    id: "calendar",
    nav: [{ label: "Calendar", path: "/calendar", order: 20 }],
    pages: [
      {
        path: "/calendar",
        component: createCalendarScreen(api),
        validateSearch: normalizeCalendarSearch,
      },
    ],
  });
