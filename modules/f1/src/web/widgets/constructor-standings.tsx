// The constructor-standings widget: the teams' championship as a ranked
// list of position, a team-colour bar, the team name, and points
// (tabular-nums). The colour bar reads as a small brand cue without
// leaning on coral, which the app keeps for its own accents.

import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { F1Api } from "../api";
import { teamColour } from "../palette";
import { f1StandingsKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";

export const ConstructorStandingsWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => {
  const query = useQuery({
    queryKey: f1StandingsKey("constructor", null),
    queryFn: () => api.constructorStandings(),
  });

  if (query.error !== null) {
    return <WidgetError message={readableError(query.error)} />;
  }
  const standings = query.data;
  if (standings === undefined) {
    return <WidgetSkeleton rows={6} />;
  }
  if (standings.length === 0) {
    return <WidgetEmpty message="No constructor standings available yet." />;
  }

  return (
    <ul className="flex flex-col">
      {standings.map((team, index) => (
        <li
          key={team.teamName}
          className="flex items-center gap-2 border-b py-1.5 text-sm last:border-b-0"
        >
          <span className="tnum w-5 shrink-0 text-right text-xs text-muted-foreground">
            {team.position ?? index + 1}
          </span>
          <span
            aria-hidden="true"
            className="h-4 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: teamColour(team.teamColour) }}
          />
          <span className="min-w-0 flex-1 truncate font-medium">
            {team.teamName}
          </span>
          <span className="tnum shrink-0 font-semibold">
            {team.points ?? 0}
          </span>
        </li>
      ))}
    </ul>
  );
};
