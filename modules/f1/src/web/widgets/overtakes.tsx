// The overtakes widget: every pass in the session as "A over B" with the
// position it happened for, plus a tally header of the total. Each driver
// side is tinted with its team colour so passes are quick to scan.

import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { Overtake } from "../../contract";
import type { F1Api } from "../api";
import { teamColour } from "../palette";
import { f1DetailKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";
import { RaceExplorerWidget } from "./session-picker";

const DriverTag = ({
  acronym,
  colour,
  number,
}: {
  readonly acronym: string | null;
  readonly colour: string | null;
  readonly number: number | null;
}): ReactElement => (
  <span className="inline-flex items-center gap-1 font-semibold">
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: teamColour(colour) }}
    />
    {acronym ?? (number === null ? "?" : String(number))}
  </span>
);

const OvertakeItem = ({ pass }: { readonly pass: Overtake }): ReactElement => (
  <li className="flex items-center gap-2 border-b py-1.5 text-sm last:border-b-0">
    <DriverTag
      acronym={pass.overtakingAcronym}
      colour={pass.overtakingColour}
      number={pass.overtakingDriverNumber}
    />
    <span className="text-xs text-muted-foreground">over</span>
    <DriverTag
      acronym={pass.overtakenAcronym}
      colour={pass.overtakenColour}
      number={pass.overtakenDriverNumber}
    />
    <span className="tnum ml-auto shrink-0 text-xs text-muted-foreground">
      {pass.position === null ? "" : `for P${pass.position}`}
    </span>
  </li>
);

const OvertakesBody = ({
  api,
  sessionKey,
}: {
  readonly api: F1Api;
  readonly sessionKey: number;
}): ReactElement => {
  const query = useQuery({
    queryKey: f1DetailKey("overtakes", sessionKey),
    queryFn: () => api.overtakes({ sessionKey }),
  });

  if (query.error !== null) {
    return <WidgetError message={readableError(query.error)} />;
  }
  const passes = query.data;
  if (passes === undefined) {
    return <WidgetSkeleton rows={6} />;
  }
  if (passes.length === 0) {
    return <WidgetEmpty message="No overtakes recorded for this session." />;
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {passes.length} {passes.length === 1 ? "overtake" : "overtakes"}
      </p>
      <ul className="flex flex-col overflow-y-auto">
        {passes.map((pass) => (
          <OvertakeItem
            key={`${pass.date ?? ""}-${pass.overtakingDriverNumber ?? ""}-${pass.overtakenDriverNumber ?? ""}`}
            pass={pass}
          />
        ))}
      </ul>
    </div>
  );
};

export const OvertakesWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => (
  <RaceExplorerWidget api={api}>
    {(sessionKey) => <OvertakesBody api={api} sessionKey={sessionKey} />}
  </RaceExplorerWidget>
);
