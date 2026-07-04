// The race-control widget: the session's messages (flags, safety cars,
// investigations) as a vertical timeline. Each entry gets a marker tinted
// to its flag colour, the lap it happened on, and the message text.

import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { RaceControlMessage } from "../../contract";
import type { F1Api } from "../api";
import { flagColour } from "../palette";
import { f1DetailKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";
import { RaceExplorerWidget } from "./session-picker";

/** The wall-clock time of an ISO instant as HH:MM, or "" when absent. */
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

const RaceControlBody = ({
  api,
  sessionKey,
}: {
  readonly api: F1Api;
  readonly sessionKey: number;
}): ReactElement => {
  const query = useQuery({
    queryKey: f1DetailKey("raceControl", sessionKey),
    queryFn: () => api.raceControl({ sessionKey }),
  });

  if (query.error !== null) {
    return <WidgetError message={readableError(query.error)} />;
  }
  const messages = query.data;
  if (messages === undefined) {
    return <WidgetSkeleton rows={6} />;
  }
  if (messages.length === 0) {
    return <WidgetEmpty message="No race-control messages for this session." />;
  }

  return (
    <ul className="flex h-full flex-col gap-2 overflow-y-auto">
      {messages.map((message) => (
        <RaceControlItem
          key={`${message.date ?? ""}-${message.lapNumber ?? ""}-${message.flag ?? ""}-${message.message ?? ""}`}
          message={message}
        />
      ))}
    </ul>
  );
};

const RaceControlItem = ({
  message,
}: {
  readonly message: RaceControlMessage;
}): ReactElement => {
  const time = clock(message.date);
  return (
    <li className="flex gap-2 text-sm">
      <span
        aria-hidden="true"
        className="mt-1 size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: flagColour(message.flag) }}
      />
      <div className="min-w-0 flex-1">
        <p className="break-words">
          {message.message ?? message.category ?? ""}
        </p>
        <p className="tnum text-xs text-muted-foreground">
          {message.lapNumber === null ? "" : `Lap ${message.lapNumber}`}
          {message.lapNumber !== null && time !== "" ? " - " : ""}
          {time}
        </p>
      </div>
    </li>
  );
};

export const RaceControlWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => (
  <RaceExplorerWidget api={api}>
    {(sessionKey) => <RaceControlBody api={api} sessionKey={sessionKey} />}
  </RaceExplorerWidget>
);
