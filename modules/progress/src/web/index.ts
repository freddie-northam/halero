// The progress module's web entry: nav and page. The host registry
// supplies the ProgressApi (backed by progress.* on its tRPC client)
// already wrapped with the module's invalidation helper; everything else
// is self-contained module code composing @halero/ui. No @halero/db import
// belongs here, ever. The module id stays "progress" (no data migration);
// the page presents as the "Developer" command center.

import { defineWebModule, type WebModule } from "@halero/module-sdk/web";
import type { AgentsApi } from "./agents-api";
import type { ProgressApi } from "./api";
import { createDeveloperScreen } from "./developer-screen";

export type {
  HeatmapDay,
  HeatmapRange,
  HeatmapView,
  ProgressStatus,
} from "../contract";
export type {
  AgentInfo,
  AgentsApi,
  RunDetail,
  RunDiff,
  RunInfo,
} from "./agents-api";
export type { ProgressApi } from "./api";
export { createDeveloperScreen } from "./developer-screen";
export { withProgressInvalidation } from "./queries";

export const createProgressWebModule = (
  api: ProgressApi,
  agentsApi: AgentsApi,
): WebModule =>
  defineWebModule({
    id: "progress",
    nav: [{ label: "Developer", path: "/developer", order: 40 }],
    pages: [
      { path: "/developer", component: createDeveloperScreen(api, agentsApi) },
    ],
  });
