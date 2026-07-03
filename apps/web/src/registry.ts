// The compile-time web module registry: the ONE place the web app names
// the modules this build ships and wires their host-side dependencies.
// Router and sidebar build from it; core never imports module code
// anywhere else.

import {
  type CalendarApi,
  createCalendarWebModule,
  createTodayAgendaSection,
} from "@halero/module-calendar/web";
import type {
  EntityLinkContribution,
  NavContribution,
  WebModule,
} from "@halero/module-sdk/web";
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

const duplicateEntityLinkMessage = (
  kind: string,
  owner: string,
  claimant: string,
): string =>
  `The "${claimant}" module links the entity kind "${kind}", but the ` +
  `"${owner}" module already links it. Each entity kind can be linked ` +
  "by exactly one module.";

/**
 * Entity link index by kind, validated like the server's kind registry:
 * two modules claiming the same kind is a build mistake and fails loudly
 * at boot, before any search surface can route a hit ambiguously.
 */
export const buildEntityLinks = (
  modules: readonly WebModule[],
): ReadonlyMap<string, EntityLinkContribution> => {
  const links = new Map<string, EntityLinkContribution>();
  const owners = new Map<string, string>();
  for (const module of modules) {
    for (const link of module.entityLinks ?? []) {
      const owner = owners.get(link.kind);
      if (owner !== undefined) {
        throw new Error(
          duplicateEntityLinkMessage(link.kind, owner, module.id),
        );
      }
      owners.set(link.kind, module.id);
      links.set(link.kind, link);
    }
  }
  return links;
};

/** Full nav (core plus module contributions), sorted by order. */
export const buildNav = (
  modules: readonly WebModule[],
): readonly NavContribution[] =>
  [...coreNav, ...modules.flatMap((module) => module.nav ?? [])].toSorted(
    (a, b) => a.order - b.order,
  );
