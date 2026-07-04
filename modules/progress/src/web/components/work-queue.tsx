// A titled Work queue section: a heading with a count badge, then the
// rows, or a skeleton while loading and a quiet empty state when the
// queue is clear (inbox-zero). Generic over the row shape so the same
// section frames PRs and issues alike.

import { Badge, Skeleton } from "@halero/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { WorkList } from "../../contract";

export interface WorkQueueProps<T> {
  readonly title: string;
  readonly emptyLabel: string;
  readonly query: UseQueryResult<WorkList<T>>;
  readonly renderRow: (item: T) => ReactElement;
}

export const WorkQueue = <T,>({
  title,
  emptyLabel,
  query,
  renderRow,
}: WorkQueueProps<T>): ReactElement => {
  const items = query.data?.items ?? [];
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {query.data !== undefined ? (
          <Badge variant="secondary">{items.length}</Badge>
        ) : null}
      </div>
      {query.data === undefined ? (
        <Skeleton className="h-16 w-full" />
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">{items.map(renderRow)}</div>
      )}
    </section>
  );
};
