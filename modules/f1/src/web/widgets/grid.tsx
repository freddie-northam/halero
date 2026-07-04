// The grid widget: the starting grid for a race, derived from the meeting's
// qualifying classification. Slots stagger left and right like a real grid,
// with pole position highlighted. The session picker is narrowed to Race
// sessions, since the grid only makes sense for a race.

import { cn } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { GridSlot } from "../../contract";
import type { F1Api } from "../api";
import { teamColour } from "../palette";
import { f1DetailKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";
import { RaceExplorerWidget } from "./session-picker";

const GridCell = ({ slot }: { readonly slot: GridSlot }): ReactElement => {
  const isPole = slot.position === 1;
  // Odd positions sit left, even positions sit right, staggered like a grid.
  const onLeft = slot.position === null || slot.position % 2 === 1;
  return (
    <li
      className={cn(
        "flex w-1/2 items-center gap-2 rounded border px-2 py-1.5 text-sm",
        onLeft ? "mr-auto" : "ml-auto",
        isPole && "border-[#DA291C] bg-[#DA291C]/10",
      )}
    >
      <span className="tnum w-5 shrink-0 text-right text-xs font-semibold text-muted-foreground">
        {slot.position ?? "-"}
      </span>
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: teamColour(slot.teamColour) }}
      />
      <span className="min-w-0 flex-1 truncate font-semibold">
        {slot.nameAcronym ?? String(slot.driverNumber)}
      </span>
    </li>
  );
};

const GridBody = ({
  api,
  sessionKey,
}: {
  readonly api: F1Api;
  readonly sessionKey: number;
}): ReactElement => {
  const query = useQuery({
    queryKey: f1DetailKey("grid", sessionKey),
    queryFn: () => api.startingGrid({ raceSessionKey: sessionKey }),
  });

  if (query.error !== null) {
    return <WidgetError message={readableError(query.error)} />;
  }
  const slots = query.data;
  if (slots === undefined) {
    return <WidgetSkeleton rows={6} />;
  }
  if (slots.length === 0) {
    return (
      <WidgetEmpty message="No qualifying grid available for this race." />
    );
  }

  return (
    <ul className="flex h-full flex-col gap-1.5 overflow-y-auto">
      {slots.map((slot) => (
        <GridCell key={slot.driverNumber} slot={slot} />
      ))}
    </ul>
  );
};

export const GridWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => (
  <RaceExplorerWidget
    api={api}
    filter={(session) => session.sessionType === "Race"}
    emptyMessage="No finished races yet this season."
  >
    {(sessionKey) => <GridBody api={api} sessionKey={sessionKey} />}
  </RaceExplorerWidget>
);
