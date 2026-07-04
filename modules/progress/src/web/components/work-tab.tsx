// The Work tab: three live GitHub queues (review requests, my open PRs +
// CI, assigned issues), always shown with empty states. Reads are live and
// on-demand with a short staleTime plus a manual Refresh; a missing-scope
// 403 surfaces through ErrorAlert as a reconnect prompt.

import { Button, Loader2 } from "@halero/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { ProgressApi } from "../api";
import { progressWorkKey, progressWorkRootKey } from "../queries";
import { ErrorAlert, GithubConnectPrompt } from "./developer-common";
import { WorkQueue } from "./work-queue";
import { WorkRow } from "./work-row";

// Live data goes stale fast; refetch on focus but no more than once a minute.
const WORK_STALE_MS = 60 * 1000;

export const WorkTab = ({
  api,
  githubConnected,
}: {
  readonly api: ProgressApi;
  readonly githubConnected: boolean;
}): ReactElement => {
  const queryClient = useQueryClient();
  const reviews = useQuery({
    queryKey: progressWorkKey("reviews"),
    queryFn: () => api.reviewRequests(),
    enabled: githubConnected,
    staleTime: WORK_STALE_MS,
  });
  const pulls = useQuery({
    queryKey: progressWorkKey("prs"),
    queryFn: () => api.myOpenPullRequests(),
    enabled: githubConnected,
    staleTime: WORK_STALE_MS,
  });
  const issues = useQuery({
    queryKey: progressWorkKey("issues"),
    queryFn: () => api.assignedIssues(),
    enabled: githubConnected,
    staleTime: WORK_STALE_MS,
  });

  if (!githubConnected) {
    return <GithubConnectPrompt />;
  }

  const error = reviews.error ?? pulls.error ?? issues.error;
  const refreshing =
    reviews.isFetching || pulls.isFetching || issues.isFetching;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: progressWorkRootKey })
          }
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          Refresh
        </Button>
      </div>
      {error !== null ? <ErrorAlert error={error} /> : null}
      <WorkQueue
        title="Awaiting my review"
        emptyLabel="No pull requests are waiting on your review."
        query={reviews}
        renderRow={(item) => (
          <WorkRow key={`${item.repo}#${item.number}`} item={item} />
        )}
      />
      <WorkQueue
        title="My open pull requests"
        emptyLabel="You have no open pull requests."
        query={pulls}
        renderRow={(item) => (
          <WorkRow
            key={`${item.repo}#${item.number}`}
            item={item}
            status={{
              reviewDecision: item.reviewDecision,
              checks: item.checks,
            }}
          />
        )}
      />
      <WorkQueue
        title="Assigned to me"
        emptyLabel="No issues are assigned to you."
        query={issues}
        renderRow={(item) => (
          <WorkRow key={`${item.repo}#${item.number}`} item={item} />
        )}
      />
    </div>
  );
};
