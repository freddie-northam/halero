// One headline number for the Activity tab's card grid (Wispr-style): a
// big value over a small label, with an optional hint line beneath.

import { Card, CardContent } from "@halero/ui";
import type { ReactElement } from "react";

export interface StatCardProps {
  readonly label: string;
  readonly value: string | number;
  readonly hint?: string;
}

export const StatCard = ({
  label,
  value,
  hint,
}: StatCardProps): ReactElement => (
  <Card className="py-4">
    <CardContent>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint !== undefined ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </CardContent>
  </Card>
);
