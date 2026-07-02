import { Repeat } from "@halero/ui";
import type { ReactElement } from "react";

/** The subtle marker for instances expanded from a recurring event. */
export const RecurrenceIcon = (): ReactElement => (
  <Repeat
    role="img"
    aria-label="Repeats"
    className="size-3 shrink-0 text-muted-foreground"
  />
);
