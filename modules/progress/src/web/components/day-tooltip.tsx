import { TooltipContent } from "@halero/ui";
import type { ReactElement } from "react";

export interface DayTooltipProps {
  /** Calendar date ("YYYY-MM-DD"). */
  readonly date: string;
  readonly count: number;
}

/**
 * "2 July 2026" for a day cell's tooltip. The input is a calendar date
 * string, so formatting its UTC midnight keeps the label on that exact
 * date regardless of the browser's own timezone.
 */
const formatDay = (date: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

const contributionLine = (date: string, count: number): string => {
  const when = formatDay(date);
  if (count === 0) {
    return `No contributions on ${when}`;
  }
  const noun = count === 1 ? "contribution" : "contributions";
  return `${count} ${noun} on ${when}`;
};

/** The tooltip body shown when hovering a heatmap day cell. */
export const DayTooltip = ({ date, count }: DayTooltipProps): ReactElement => (
  <TooltipContent>{contributionLine(date, count)}</TooltipContent>
);
