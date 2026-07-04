// The Repositories tab body: per-repo contribution totals (already sorted
// by activity server-side), each linking to the repo on GitHub. Loading,
// empty, and populated states; the tab handles connect/reconnect prompts.

import { Badge, Skeleton } from "@halero/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { RepoStat, WorkList } from "../../contract";

const RepoRow = ({ repo }: { readonly repo: RepoStat }): ReactElement => (
  <a
    href={`https://github.com/${repo.repo}`}
    target="_blank"
    rel="noreferrer"
    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors hover:bg-accent/60"
  >
    <span className="truncate text-sm font-medium">{repo.repo}</span>
    <Badge variant="secondary">
      {repo.contributions}{" "}
      {repo.contributions === 1 ? "contribution" : "contributions"}
    </Badge>
  </a>
);

export const RepoList = ({
  query,
}: {
  readonly query: UseQueryResult<WorkList<RepoStat>>;
}): ReactElement => {
  if (query.data === undefined) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (query.data.items.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
        No repository activity in the last year yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {query.data.items.map((repo) => (
        <RepoRow key={repo.repo} repo={repo} />
      ))}
    </div>
  );
};
