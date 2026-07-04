// The latest-result widget: the most recent session's classification as
// a table. Each row shows position, a team-colour dot, the driver's
// acronym and name, their team, the gap to the leader (a "+1 LAP" style
// string or a time, blank for the leader), points, and a DNF/DNS/DSQ
// badge when the driver did not finish clean. A null result (no session
// classified yet this season) shows a friendly empty state.

import { Badge, cn } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { ResultRow } from "../../contract";
import type { F1Api } from "../api";
import { formatGap, teamColour } from "../palette";
import { f1LatestResultKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";

/** DNF/DNS/DSQ take precedence over a gap; a clean finisher gets null. */
const statusBadge = (row: ResultRow): string | null => {
  if (row.dsq) {
    return "DSQ";
  }
  if (row.dnf) {
    return "DNF";
  }
  if (row.dns) {
    return "DNS";
  }
  return null;
};

const ResultRowItem = ({ row }: { readonly row: ResultRow }): ReactElement => {
  const status = statusBadge(row);
  const gap = formatGap(row.gapToLeader);
  return (
    <li className="flex items-center gap-2 border-b py-1.5 text-sm last:border-b-0">
      <span className="tnum w-5 shrink-0 text-right text-xs text-muted-foreground">
        {row.position ?? "-"}
      </span>
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: teamColour(row.teamColour) }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="font-semibold">
            {row.nameAcronym ?? String(row.driverNumber)}
          </span>
          <span className="truncate text-muted-foreground">
            {row.fullName ?? ""}
          </span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {row.teamName ?? ""}
        </span>
      </span>
      {status === null ? (
        <span className="tnum shrink-0 text-xs text-muted-foreground">
          {gap}
        </span>
      ) : (
        <Badge
          variant="outline"
          className={cn(
            "shrink-0",
            status === "DSQ" && "border-destructive text-destructive",
          )}
        >
          {status}
        </Badge>
      )}
      <span className="tnum w-6 shrink-0 text-right font-semibold">
        {row.points ?? 0}
      </span>
    </li>
  );
};

export const LatestResultWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => {
  const query = useQuery({
    queryKey: f1LatestResultKey,
    queryFn: () => api.latestResult(),
  });

  if (query.error !== null) {
    return <WidgetError message={readableError(query.error)} />;
  }
  const result = query.data;
  if (result === undefined) {
    return <WidgetSkeleton rows={6} />;
  }
  if (result === null || result.rows.length === 0) {
    return <WidgetEmpty message="No session results yet this season." />;
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {result.meetingName === null
          ? result.sessionName
          : `${result.meetingName} - ${result.sessionName}`}
      </p>
      <ul className="flex flex-col">
        {result.rows.map((row) => (
          <ResultRowItem key={row.driverNumber} row={row} />
        ))}
      </ul>
    </div>
  );
};
