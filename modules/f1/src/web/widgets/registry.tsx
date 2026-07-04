// The widget registry: the single source of truth for what widgets a
// board can hold. Each WidgetDef pairs a stable type string (persisted in
// a board's layout) with its display name, category, default footprint,
// and the component that renders it. The board grid and the add-widget
// menu both read from here, so adding a widget is a one-entry change.

import type { ComponentType } from "react";
import type { WidgetSize } from "../../contract";
import type { F1Api } from "../api";
import { CalendarWidget } from "./calendar";
import { ConstructorStandingsWidget } from "./constructor-standings";
import { DriverStandingsWidget } from "./driver-standings";
import { LatestResultWidget } from "./latest-result";
import { NextRaceWidget } from "./next-race";
import { WeekendScheduleWidget } from "./weekend-schedule";

/** The props every widget component receives: the API seam and its config. */
export interface WidgetProps {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}

export interface WidgetDef {
  /** Stable id persisted in board layouts; never rename in place. */
  readonly type: string;
  readonly title: string;
  readonly category: string;
  readonly defaultSize: WidgetSize;
  readonly Component: ComponentType<WidgetProps>;
}

export const WIDGETS: Readonly<Record<string, WidgetDef>> = {
  "next-race": {
    type: "next-race",
    title: "Next race",
    category: "Race weekend",
    defaultSize: "l",
    Component: NextRaceWidget,
  },
  "weekend-schedule": {
    type: "weekend-schedule",
    title: "Weekend schedule",
    category: "Race weekend",
    defaultSize: "m",
    Component: WeekendScheduleWidget,
  },
  calendar: {
    type: "calendar",
    title: "Season calendar",
    category: "Race weekend",
    defaultSize: "l",
    Component: CalendarWidget,
  },
  "driver-standings": {
    type: "driver-standings",
    title: "Driver standings",
    category: "Championship",
    defaultSize: "m",
    Component: DriverStandingsWidget,
  },
  "constructor-standings": {
    type: "constructor-standings",
    title: "Constructor standings",
    category: "Championship",
    defaultSize: "m",
    Component: ConstructorStandingsWidget,
  },
  "latest-result": {
    type: "latest-result",
    title: "Latest result",
    category: "Results",
    defaultSize: "l",
    Component: LatestResultWidget,
  },
};

/** The registry in display order, for the add-widget menu. */
export const WIDGET_LIST: readonly WidgetDef[] = [
  WIDGETS["next-race"],
  WIDGETS["weekend-schedule"],
  WIDGETS.calendar,
  WIDGETS["driver-standings"],
  WIDGETS["constructor-standings"],
  WIDGETS["latest-result"],
].filter((def): def is WidgetDef => def !== undefined);
