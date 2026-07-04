// One row in a Work queue: a PR or issue linking out to GitHub, with its
// repo + number and (for my open PRs) review and CI status pills. Pure
// presentation; the queue decides what data each row gets.

import { Badge } from "@halero/ui";
import type { ReactElement } from "react";
import type { ChecksState, WorkItem } from "../../contract";

export interface WorkRowStatus {
  readonly reviewDecision: string | null;
  readonly checks: ChecksState;
}

export interface WorkRowProps {
  readonly item: WorkItem;
  readonly status?: WorkRowStatus;
}

const CHECKS_PILL: Record<
  ChecksState,
  {
    readonly label: string;
    readonly variant: "secondary" | "destructive";
  } | null
> = {
  success: { label: "Checks passing", variant: "secondary" },
  failure: { label: "Checks failing", variant: "destructive" },
  pending: { label: "Checks running", variant: "secondary" },
  none: null,
};

const REVIEW_PILL: Record<
  string,
  { readonly label: string; readonly variant: "secondary" | "destructive" }
> = {
  APPROVED: { label: "Approved", variant: "secondary" },
  CHANGES_REQUESTED: { label: "Changes requested", variant: "destructive" },
  REVIEW_REQUIRED: { label: "Review required", variant: "secondary" },
};

const StatusPills = ({ status }: { readonly status: WorkRowStatus }) => {
  const review = status.reviewDecision
    ? REVIEW_PILL[status.reviewDecision]
    : undefined;
  const checks = CHECKS_PILL[status.checks];
  if (review === undefined && checks === null) {
    return null;
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {review !== undefined ? (
        <Badge variant={review.variant}>{review.label}</Badge>
      ) : null}
      {checks !== null ? (
        <Badge variant={checks.variant}>{checks.label}</Badge>
      ) : null}
    </div>
  );
};

export const WorkRow = ({ item, status }: WorkRowProps): ReactElement => (
  <a
    href={item.url}
    target="_blank"
    rel="noreferrer"
    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors hover:bg-accent/60"
  >
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">{item.title}</p>
      <p className="truncate text-xs text-muted-foreground">
        {item.repo} #{item.number}
      </p>
    </div>
    {status !== undefined ? <StatusPills status={status} /> : null}
  </a>
);
