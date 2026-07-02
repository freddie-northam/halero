// The compile-time web module registry: the ONE place the web app names
// the modules this build ships and wires their host-side dependencies.
// Router and sidebar build from it; core never imports module code
// anywhere else.

import {
  type CalendarApi,
  createCalendarWebModule,
  createTodayAgendaSection,
} from "@halero/module-calendar/web";
import type { NavContribution, WebModule } from "@halero/module-sdk/web";
import {
  createTodayWebModule,
  type TodaySection,
} from "@halero/module-today/web";
import type { HaleroApi } from "./lib/api";
import type { TrpcClient } from "./lib/trpc";

/** Core-owned navigation. Settings stays core; modules slot in around it. */
const coreNav: readonly NavContribution[] = [
  { label: "Settings", path: "/settings", order: 100 },
];

/**
 * The Today page's sections, hardcoded per the v0.1 plan's YAGNI call:
 * no generic contribution-point framework yet. The array already has the
 * contribution shape (id, order, component), so when the contribution
 * mechanism arrives modules will declare their sections themselves and
 * this list disappears without touching module code.
 */
export const buildTodaySections = (
  calendarApi: CalendarApi,
): readonly TodaySection[] => [
  {
    id: "calendar.agenda",
    order: 10,
    component: createTodayAgendaSection(calendarApi),
  },
];

/** The web modules this build ships with, wired to the server clients. */
export const buildWebModules = (
  client: TrpcClient,
  api: HaleroApi,
): readonly WebModule[] => {
  const calendarApi: CalendarApi = {
    today: () => client.modules.calendar.today.query(),
    range: (from, to) => client.modules.calendar.range.query({ from, to }),
  };
  return [
    createTodayWebModule({
      api: {
        // The greeting and date line reuse the calendar module's today
        // anchor, which already carries the home timezone and its current
        // date; no dedicated server endpoint exists for the Today page.
        home: () => client.modules.calendar.today.query(),
        googleConnectionStatus: async () =>
          (await api.googleStatus()).connection?.status ?? null,
      },
      sections: buildTodaySections(calendarApi),
    }),
    createCalendarWebModule(calendarApi),
  ];
};

/** Full nav (core plus module contributions), sorted by order. */
export const buildNav = (
  modules: readonly WebModule[],
): readonly NavContribution[] =>
  [...coreNav, ...modules.flatMap((module) => module.nav ?? [])].toSorted(
    (a, b) => a.order - b.order,
  );
