// The F1 module's web entry: nav, page, entity link, and palette command
// contributions. The host registry supplies the F1Api (backed by
// modules.f1.* on its tRPC client) already wrapped with the module's
// invalidation helper; everything else is self-contained module code
// composing @halero/ui. No @halero/db import belongs here, ever.

import { defineWebModule, type WebModule } from "@halero/module-sdk/web";
import { F1_SESSION_KIND } from "@halero/schemas";
import type { F1Api } from "./api";
import { createF1Screen } from "./f1-screen";
import { createNextRaceCommand } from "./next-race-command";

export type {
  Board,
  DriverStanding,
  NextUp,
  ResultRow,
  SeasonSchedule,
  SessionLite,
  SessionResult,
  SessionState,
  TeamStanding,
  Weekend,
  WidgetInstance,
  WidgetSize,
} from "../contract";
export type { F1Api } from "./api";
export { withF1Invalidation } from "./queries";

export const createF1WebModule = (api: F1Api): WebModule =>
  defineWebModule({
    id: "f1",
    nav: [{ label: "F1", path: "/f1", order: 50 }],
    pages: [{ path: "/f1", component: createF1Screen(api) }],
    entityLinks: [
      {
        kind: F1_SESSION_KIND,
        label: "F1 Session",
        // v0.1 has no per-session anchor; the board page is where every
        // F1 hit lands, so a session hit routes there.
        buildLink: () => ({ path: "/f1" }),
      },
    ],
    commands: [createNextRaceCommand(api)],
  });
