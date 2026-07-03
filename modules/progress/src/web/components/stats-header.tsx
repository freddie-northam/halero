import { Badge, Card, CardContent, CardHeader, CardTitle } from "@halero/ui";
import type { ReactElement } from "react";
import type { HeatmapRange } from "../../contract";

export interface StatsHeaderProps {
  readonly total: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly range: HeatmapRange;
}

const rangePhrase = (range: HeatmapRange): string => {
  if (range === "year") {
    return "in the last year";
  }
  if (range === "6months") {
    return "in the last 6 months";
  }
  return "this month";
};

const dayCount = (days: number): string =>
  `${days} ${days === 1 ? "day" : "days"}`;

/** The headline card: total contributions plus current and longest streaks. */
export const StatsHeader = ({
  total,
  currentStreak,
  longestStreak,
  range,
}: StatsHeaderProps): ReactElement => {
  const noun = total === 1 ? "contribution" : "contributions";
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {total} {noun} {rangePhrase(range)}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          Current streak: {dayCount(currentStreak)}
        </Badge>
        <Badge variant="secondary">
          Longest streak: {dayCount(longestStreak)}
        </Badge>
      </CardContent>
    </Card>
  );
};
