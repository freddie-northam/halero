// The Repositories tab: per-repo contribution totals from a live GitHub
// read, sorted by activity. Needs GitHub connected; a missing-scope 403
// surfaces through ErrorAlert as a reconnect prompt.

import { Button, Loader2 } from "@halero/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { ProgressApi } from "../api";
import { progressWorkKey } from "../queries";
import { ErrorAlert, GithubConnectPrompt } from "./developer-common";
import { RepoList } from "./repo-list";

const REPOS_STALE_MS = 5 * 60 * 1000;

export const RepositoriesTab = ({
  api,
  githubConnected,
}: {
  readonly api: ProgressApi;
  readonly githubConnected: boolean;
}): ReactElement => {
  const queryClient = useQueryClient();
  const repos = useQuery({
    queryKey: progressWorkKey("repos"),
    queryFn: () => api.repositories(),
    enabled: githubConnected,
    staleTime: REPOS_STALE_MS,
  });

  if (!githubConnected) {
    return <GithubConnectPrompt />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: progressWorkKey("repos"),
            })
          }
          disabled={repos.isFetching}
        >
          {repos.isFetching ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          Refresh
        </Button>
      </div>
      {repos.error !== null ? <ErrorAlert error={repos.error} /> : null}
      <RepoList query={repos} />
    </div>
  );
};
