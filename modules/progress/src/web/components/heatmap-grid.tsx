// A source-agnostic contribution heatmap: 7 weekday rows, one column per
// week, each cell a rounded square shaded by its count relative to the
// busiest day. It knows nothing about GitHub; the caller hands it the
// densified days and a five-stop colour ramp (empty -> max).

import { Tooltip, TooltipProvider, TooltipTrigger } from "@halero/ui";
import type { ReactElement } from "react";
import type { HeatmapDay } from "../../contract";
import { colorLevel, weeksFromDays } from "../helpers/heatmap-layout";
import { DayTooltip } from "./day-tooltip";

export interface HeatmapGridProps {
  readonly days: readonly HeatmapDay[];
  /** Five CSS colours, from the empty band (index 0) to the max (index 4). */
  readonly colorRamp: readonly string[];
}

const maxCount = (days: readonly HeatmapDay[]): number =>
  days.reduce((max, day) => (day.count > max ? day.count : max), 0);

const HeatmapCell = ({
  cell,
  max,
  colorRamp,
}: {
  readonly cell: HeatmapDay | null;
  readonly max: number;
  readonly colorRamp: readonly string[];
}): ReactElement => {
  if (cell === null) {
    return <div className="size-3 rounded-sm" aria-hidden="true" />;
  }
  const level = colorLevel(cell.count, max);
  const color = colorRamp[level] ?? colorRamp[0] ?? "transparent";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="size-3 rounded-sm" style={{ backgroundColor: color }} />
      </TooltipTrigger>
      <DayTooltip date={cell.date} count={cell.count} />
    </Tooltip>
  );
};

/** Renders the week columns as a fixed 7-row CSS grid flowing column-first. */
// Flattens the week columns into keyed cells for a column-first grid.
// Real days key by their date; padding cells key by their week/weekday
// position, so keys are stable content, not bare array indices.
const keyedCells = (
  weeks: (HeatmapDay | null)[][],
): readonly { readonly key: string; readonly cell: HeatmapDay | null }[] =>
  weeks.flatMap((week, weekIndex) =>
    week.map((cell, dayIndex) => ({
      key: cell === null ? `pad-${weekIndex}-${dayIndex}` : cell.date,
      cell,
    })),
  );

export const HeatmapGrid = ({
  days,
  colorRamp,
}: HeatmapGridProps): ReactElement => {
  const max = maxCount(days);
  const cells = keyedCells(weeksFromDays(days));
  return (
    <TooltipProvider delayDuration={100}>
      <div className="overflow-x-auto">
        <div
          className="grid gap-1"
          // grid-auto-flow is set inline, not via a Tailwind utility: the
          // `grid-flow-col` class is not always emitted into the app's built
          // CSS, and without column flow every cell wraps onto its own row
          // (the grid collapses to a single column).
          style={{
            gridAutoFlow: "column",
            gridTemplateRows: "repeat(7, minmax(0, 1fr))",
          }}
          role="img"
          aria-label="Contribution heatmap"
        >
          {cells.map((entry) => (
            <HeatmapCell
              key={entry.key}
              cell={entry.cell}
              max={max}
              colorRamp={colorRamp}
            />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
};
