// The compile-time web module registry: the ONE place the web app names
// the modules this build ships and wires their host-side dependencies.
// Router and sidebar build from it; core never imports module code
// anywhere else.

import { createCalendarWebModule } from "@halero/module-calendar/web";
import type { NavContribution, WebModule } from "@halero/module-sdk/web";
import type { TrpcClient } from "./lib/trpc";

/**
 * Core-owned navigation. Today stays a core placeholder until Task 11
 * and Settings stays core; modules slot in between via their orders.
 */
const coreNav: readonly NavContribution[] = [
  { label: "Today", path: "/", order: 10 },
  { label: "Settings", path: "/settings", order: 100 },
];

/** The web modules this build ships with, wired to the tRPC client. */
export const buildWebModules = (client: TrpcClient): readonly WebModule[] => [
  createCalendarWebModule({
    agenda: (days) =>
      client.modules.calendar.agenda.query(
        days === undefined ? undefined : { days },
      ),
  }),
];

/** Full nav (core plus module contributions), sorted by order. */
export const buildNav = (
  modules: readonly WebModule[],
): readonly NavContribution[] =>
  [...coreNav, ...modules.flatMap((module) => module.nav ?? [])].toSorted(
    (a, b) => a.order - b.order,
  );
