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
import { GridWidget } from "./grid";
import { HeadToHeadWidget } from "./head-to-head";
import { LapChartWidget } from "./lap-chart";
import { LatestResultWidget } from "./latest-result";
import { LiveControlWidget } from "./live-control";
import { LiveTimingTowerWidget } from "./live-timing-tower";
import { LiveWeatherWidget } from "./live-weather";
import { NextRaceWidget } from "./next-race";
import { OvertakesWidget } from "./overtakes";
import { PitStopsWidget } from "./pit-stops";
import { PositionChangesWidget } from "./position-changes";
import { RaceControlWidget } from "./race-control";
import { TeamRadioWidget } from "./team-radio";
import { TyreStrategyWidget } from "./tyre-strategy";
import { WeatherWidget } from "./weather";
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
  "tyre-strategy": {
    type: "tyre-strategy",
    title: "Tyre strategy",
    category: "Analysis",
    defaultSize: "l",
    Component: TyreStrategyWidget,
  },
  "lap-chart": {
    type: "lap-chart",
    title: "Lap times",
    category: "Analysis",
    defaultSize: "l",
    Component: LapChartWidget,
  },
  "position-changes": {
    type: "position-changes",
    title: "Position changes",
    category: "Analysis",
    defaultSize: "l",
    Component: PositionChangesWidget,
  },
  "pit-stops": {
    type: "pit-stops",
    title: "Pit stops",
    category: "Analysis",
    defaultSize: "m",
    Component: PitStopsWidget,
  },
  "race-control": {
    type: "race-control",
    title: "Race control",
    category: "Analysis",
    defaultSize: "m",
    Component: RaceControlWidget,
  },
  "team-radio": {
    type: "team-radio",
    title: "Team radio",
    category: "Analysis",
    defaultSize: "m",
    Component: TeamRadioWidget,
  },
  overtakes: {
    type: "overtakes",
    title: "Overtakes",
    category: "Analysis",
    defaultSize: "m",
    Component: OvertakesWidget,
  },
  weather: {
    type: "weather",
    title: "Weather",
    category: "Analysis",
    defaultSize: "m",
    Component: WeatherWidget,
  },
  grid: {
    type: "grid",
    title: "Starting grid",
    category: "Analysis",
    defaultSize: "m",
    Component: GridWidget,
  },
  "head-to-head": {
    type: "head-to-head",
    title: "Head to head",
    category: "Analysis",
    defaultSize: "m",
    Component: HeadToHeadWidget,
  },
  "live-timing-tower": {
    type: "live-timing-tower",
    title: "Live timing",
    category: "Live",
    defaultSize: "l",
    Component: LiveTimingTowerWidget,
  },
  "live-control": {
    type: "live-control",
    title: "Live timing status",
    category: "Live",
    defaultSize: "m",
    Component: LiveControlWidget,
  },
  "live-weather": {
    type: "live-weather",
    title: "Live weather",
    category: "Live",
    defaultSize: "m",
    Component: LiveWeatherWidget,
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
  WIDGETS["tyre-strategy"],
  WIDGETS["lap-chart"],
  WIDGETS["position-changes"],
  WIDGETS["pit-stops"],
  WIDGETS["race-control"],
  WIDGETS["team-radio"],
  WIDGETS.overtakes,
  WIDGETS.weather,
  WIDGETS.grid,
  WIDGETS["head-to-head"],
  WIDGETS["live-timing-tower"],
  WIDGETS["live-control"],
  WIDGETS["live-weather"],
].filter((def): def is WidgetDef => def !== undefined);
