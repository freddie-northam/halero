// The shared scaffolding every race-explorer widget sits on: a hook that
// loads the season's finished sessions and tracks the selected one, a small
// dropdown to switch sessions, and a wrapper that renders the picker over a
// body only once a session is chosen. Keeping the loading/empty/error and
// picker logic here means each widget is just its own detail body.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import type { RaceSessionRef } from "../../contract";
import type { F1Api } from "../api";
import { f1RaceSessionsKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";

export interface RaceSessionState {
  readonly sessions: readonly RaceSessionRef[] | undefined;
  readonly sessionKey: number | null;
  readonly setSessionKey: (key: number) => void;
  readonly error: unknown;
}

/**
 * Loads the season's finished sessions and holds the selected one. The
 * selection defaults to the newest matching session; an optional filter
 * narrows the list (e.g. the grid widget only offers Race sessions).
 */
export const useRaceSessions = (
  api: F1Api,
  filter?: (session: RaceSessionRef) => boolean,
): RaceSessionState => {
  const query = useQuery({
    queryKey: f1RaceSessionsKey,
    queryFn: () => api.raceSessions(),
  });
  const [override, setOverride] = useState<number | null>(null);
  const all = query.data;
  const sessions =
    all === undefined
      ? undefined
      : filter === undefined
        ? all
        : all.filter(filter);
  const fallback = sessions?.[0]?.sessionKey ?? null;
  const sessionKey = override ?? fallback;
  return {
    sessions,
    sessionKey,
    setSessionKey: setOverride,
    error: query.error,
  };
};

/** The session dropdown; values are the session key as a string. */
export const SessionPicker = ({
  sessions,
  sessionKey,
  onChange,
}: {
  readonly sessions: readonly RaceSessionRef[];
  readonly sessionKey: number | null;
  readonly onChange: (key: number) => void;
}): ReactElement => (
  <Select
    value={sessionKey === null ? undefined : String(sessionKey)}
    onValueChange={(value) => onChange(Number(value))}
  >
    <SelectTrigger size="sm" className="w-full">
      <SelectValue placeholder="Select a session" />
    </SelectTrigger>
    <SelectContent>
      {sessions.map((session) => (
        <SelectItem key={session.sessionKey} value={String(session.sessionKey)}>
          {session.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/**
 * Renders the session picker over a widget body. `children` receives the
 * chosen session key and must return a self-contained body component, so
 * its own detail query lives in its own fiber (hook order stays stable).
 */
export const RaceExplorerWidget = ({
  api,
  filter,
  emptyMessage,
  children,
}: {
  readonly api: F1Api;
  readonly filter?: (session: RaceSessionRef) => boolean;
  readonly emptyMessage?: string;
  readonly children: (sessionKey: number) => ReactNode;
}): ReactElement => {
  const { sessions, sessionKey, setSessionKey, error } = useRaceSessions(
    api,
    filter,
  );
  if (error !== null && error !== undefined) {
    return <WidgetError message={readableError(error)} />;
  }
  if (sessions === undefined) {
    return <WidgetSkeleton rows={5} />;
  }
  if (sessions.length === 0 || sessionKey === null) {
    return (
      <WidgetEmpty
        message={emptyMessage ?? "No finished sessions yet this season."}
      />
    );
  }
  return (
    <div className="flex h-full flex-col gap-3">
      <SessionPicker
        sessions={sessions}
        sessionKey={sessionKey}
        onChange={setSessionKey}
      />
      <div className="min-h-0 flex-1">{children(sessionKey)}</div>
    </div>
  );
};
