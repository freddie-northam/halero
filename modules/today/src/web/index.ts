// The today module's web entry: the home nav entry and the Today page.
// Web-only on purpose: the page composes data other modules and core
// already serve (the host wires the TodayApi seam and the hardcoded
// section array), so there is no server contribution and no db import.

import { defineWebModule, type WebModule } from "@halero/module-sdk/web";
import type { TodaySection } from "./sections";
import { createTodayScreen, type TodayApi } from "./today-screen";

export type { Greeting } from "./greeting";
export { greetingForHour, hourInZone } from "./greeting";
export type { TodaySection } from "./sections";
export type { TodayApi, TodayHome } from "./today-screen";
export { createTodayScreen } from "./today-screen";

export interface TodayModuleOptions {
  readonly api: TodayApi;
  /** Host-wired sections; becomes a module contribution point later. */
  readonly sections: readonly TodaySection[];
  /** Injectable clock for tests; the app uses the real one. */
  readonly now?: () => number;
}

export const createTodayWebModule = ({
  api,
  sections,
  now,
}: TodayModuleOptions): WebModule =>
  defineWebModule({
    id: "today",
    nav: [{ label: "Today", path: "/", order: 10, icon: "home" }],
    pages: [{ path: "/", component: createTodayScreen(api, sections, now) }],
  });
