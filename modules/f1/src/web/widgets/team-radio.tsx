// The team-radio widget: the session's radio clips, each a driver chip with
// the time and a native audio player for the recording. Team radio is sparse
// in the 2026 feed, so an empty session gets a friendly note rather than a
// blank panel.

import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { TeamRadioClip } from "../../contract";
import type { F1Api } from "../api";
import { teamColour } from "../palette";
import { f1DetailKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";
import { RaceExplorerWidget } from "./session-picker";

const clock = (iso: string | null): string => {
  if (iso === null) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

const RadioClip = ({
  clip,
}: {
  readonly clip: TeamRadioClip;
}): ReactElement => (
  <li className="flex flex-col gap-1.5 border-b py-2 text-sm last:border-b-0">
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: teamColour(clip.teamColour) }}
      />
      <span className="font-semibold">
        {clip.nameAcronym ??
          (clip.driverNumber === null ? "Team" : String(clip.driverNumber))}
      </span>
      <span className="tnum ml-auto text-xs text-muted-foreground">
        {clock(clip.date)}
      </span>
    </div>
    {clip.recordingUrl === null ? (
      <span className="text-xs text-muted-foreground">
        Recording unavailable
      </span>
    ) : (
      <audio
        controls
        preload="none"
        src={clip.recordingUrl}
        className="h-8 w-full"
      >
        <track kind="captions" />
      </audio>
    )}
  </li>
);

const TeamRadioBody = ({
  api,
  sessionKey,
}: {
  readonly api: F1Api;
  readonly sessionKey: number;
}): ReactElement => {
  const query = useQuery({
    queryKey: f1DetailKey("teamRadio", sessionKey),
    queryFn: () => api.teamRadio({ sessionKey }),
  });

  if (query.error !== null) {
    return <WidgetError message={readableError(query.error)} />;
  }
  const clips = query.data;
  if (clips === undefined) {
    return <WidgetSkeleton rows={5} />;
  }
  if (clips.length === 0) {
    return (
      <WidgetEmpty message="No team radio captured for this session yet." />
    );
  }

  return (
    <ul className="flex h-full flex-col overflow-y-auto">
      {clips.map((clip) => (
        <RadioClip
          key={`${clip.driverNumber ?? "x"}-${clip.date ?? ""}-${clip.recordingUrl ?? ""}`}
          clip={clip}
        />
      ))}
    </ul>
  );
};

export const TeamRadioWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => (
  <RaceExplorerWidget api={api}>
    {(sessionKey) => <TeamRadioBody api={api} sessionKey={sessionKey} />}
  </RaceExplorerWidget>
);
