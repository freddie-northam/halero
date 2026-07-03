// The progress module's web entry: nav and page. The host registry
// supplies the ProgressApi (backed by modules.progress.* on its tRPC
// client) already wrapped with the module's invalidation helper;
// everything else is self-contained module code composing @halero/ui. No
// @halero/db import belongs here, ever.

import { defineWebModule, type WebModule } from "@halero/module-sdk/web";
import type { ProgressApi } from "./api";
import { createProgressScreen } from "./progress-screen";

export type {
  HeatmapDay,
  HeatmapRange,
  HeatmapView,
  ProgressStatus,
} from "../contract";
export type { ProgressApi } from "./api";
export { createProgressScreen } from "./progress-screen";
export { withProgressInvalidation } from "./queries";

export const createProgressWebModule = (api: ProgressApi): WebModule =>
  defineWebModule({
    id: "progress",
    nav: [{ label: "Progress", path: "/progress", order: 40 }],
    pages: [{ path: "/progress", component: createProgressScreen(api) }],
  });
