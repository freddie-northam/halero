// The live-timing tower: the marquee live widget. It polls the live.timing
// seam every five seconds and renders one of three states. When the session
// is live it shows the timing tower proper, a dense row per driver with the
// position, a team-colour bar, acronym and name, the gap to the leader and
// the interval ahead, and a tyre chip. When no session is live it shows a
// calm message; when a session is live but no credential is stored it shows
// a call-to-action that opens the shared connect dialog.

import { Button } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { LiveSession, TimingRow } from "../../contract";
import type { F1Api } from "../api";
import {
  formatGap,
  formatLapTime,
  formatSessionDay,
  teamColour,
  tyreColour,
} from "../palette";
import { f1LiveLeafKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";
import { LiveConnectDialog } from "./live-control";

const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The pulsing "LIVE" marker that heads the tower during a live session. */
const LiveDot = (): ReactElement => (
  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#DA291C]">
    <span
      aria-hidden="true"
      className="size-2 animate-pulse rounded-full bg-[#DA291C]"
    />
    LIVE
  </span>
);

/** A compact tyre chip: a compound-coloured dot, its initial, and its age. */
const TyreChip = ({
  compound,
  age,
}: {
  readonly compound: string | null;
  readonly age: number | null;
}): ReactElement => (
  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
    <span
      aria-hidden="true"
      className="size-2.5 rounded-full"
      style={{ backgroundColor: tyreColour(compound) }}
    />
    <span className="tnum">
      {compound === null ? "-" : compound.trim().charAt(0).toUpperCase()}
      {age === null ? "" : ` ${age}L`}
    </span>
  </span>
);

const TowerRow = ({ row }: { readonly row: TimingRow }): ReactElement => (
  <li className="flex items-center gap-2 border-b py-1.5 text-sm last:border-b-0">
    <span className="tnum w-5 shrink-0 text-right text-xs text-muted-foreground">
      {row.position ?? "-"}
    </span>
    <span
      aria-hidden="true"
      className="h-5 w-1 shrink-0 rounded-full"
      style={{ backgroundColor: teamColour(row.teamColour) }}
    />
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline gap-1.5">
        <span className="font-semibold">
          {row.nameAcronym ?? String(row.driverNumber)}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {row.fullName ?? ""}
        </span>
      </span>
    </span>
    <span className="flex w-28 shrink-0 flex-col items-end leading-tight">
      <span className="tnum font-medium">
        {formatGap(row.gapToLeader) || "-"}
      </span>
      <span className="tnum text-xs text-muted-foreground">
        {formatGap(row.interval) || formatLapTime(row.lastLap)}
      </span>
    </span>
    <TyreChip compound={row.compound} age={row.tyreAge} />
  </li>
);

/** A subtitle line for the session, e.g. "Monaco Grand Prix - Race". */
const sessionLabel = (session: LiveSession): string => {
  const meeting = session.meetingName ?? session.sessionName;
  return session.meetingName === null
    ? session.sessionName
    : `${meeting} - ${session.sessionName}`;
};

const IdleState = ({
  session,
}: {
  readonly session: LiveSession | null;
}): ReactElement => {
  if (session === null) {
    return <WidgetEmpty message="No session is live right now." />;
  }
  const day = formatSessionDay(session.dateStart, BROWSER_TZ);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
      <p className="text-sm font-semibold">{sessionLabel(session)}</p>
      <p className="text-sm text-muted-foreground">
        Not live right now{day === "TBC" ? "" : ` - ${day}`}
      </p>
    </div>
  );
};

const CredentialCta = ({ api }: { readonly api: F1Api }): ReactElement => (
  <div className="flex h-full flex-col items-center justify-center gap-3 px-2 text-center">
    <p className="text-sm text-muted-foreground">
      Connect your OpenF1 account to see live timing.
    </p>
    <LiveConnectDialog
      api={api}
      trigger={
        <Button type="button" size="sm">
          Connect
        </Button>
      }
    />
  </div>
);

export const LiveTimingTowerWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => {
  const query = useQuery({
    queryKey: f1LiveLeafKey("timing"),
    queryFn: () => api.live.timing(),
    refetchInterval: 5000,
  });

  if (query.error !== null) {
    return <WidgetError message={readableError(query.error)} />;
  }
  const timing = query.data;
  if (timing === undefined) {
    return <WidgetSkeleton rows={6} />;
  }
  if (timing.requiresCredential) {
    return <CredentialCta api={api} />;
  }
  const { session, rows } = timing;
  if (session === null || !session.isLive || rows.length === 0) {
    return <IdleState session={session} />;
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted-foreground">
          {sessionLabel(session)}
        </span>
        <LiveDot />
      </div>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <TowerRow key={row.driverNumber} row={row} />
        ))}
      </ul>
    </div>
  );
};
