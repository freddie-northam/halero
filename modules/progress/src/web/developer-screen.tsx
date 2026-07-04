// The Developer page: a command center over the narrow ProgressApi seam.
// Three tabs, Work (live GitHub queues), Activity (contribution stats +
// heatmap over developer sources), and Repositories (per-repo totals). No
// tRPC client and no @halero/db here, ever. The module id stays "progress"
// (a deliberate low-churn choice); only the label and route are "Developer".

import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { ProgressApi } from "./api";
import { ActivityTab } from "./components/activity-tab";
import {
  developerSourcesOf,
  ErrorAlert,
  isGithubConnected,
} from "./components/developer-common";
import { RepositoriesTab } from "./components/repositories-tab";
import { WorkTab } from "./components/work-tab";
import { progressStatusKey } from "./queries";

/** Builds the Developer page around the host-wired ProgressApi. */
export const createDeveloperScreen = (api: ProgressApi) => {
  const DeveloperScreen = (): ReactElement => {
    const status = useQuery({
      queryKey: progressStatusKey,
      queryFn: () => api.status(),
    });
    const githubConnected = isGithubConnected(status.data);
    const devSources = developerSourcesOf(status.data);

    const body = (): ReactElement => {
      if (status.error !== null) {
        return <ErrorAlert error={status.error} />;
      }
      if (status.data === undefined) {
        return <Skeleton className="h-40 w-full" />;
      }
      return (
        <Tabs defaultValue="work">
          <TabsList aria-label="Developer sections">
            <TabsTrigger value="work">Work</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="repositories">Repositories</TabsTrigger>
          </TabsList>
          <TabsContent value="work" className="mt-6">
            <WorkTab api={api} githubConnected={githubConnected} />
          </TabsContent>
          <TabsContent value="activity" className="mt-6">
            <ActivityTab api={api} sources={devSources} />
          </TabsContent>
          <TabsContent value="repositories" className="mt-6">
            <RepositoriesTab api={api} githubConnected={githubConnected} />
          </TabsContent>
        </Tabs>
      );
    };

    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <header className="mb-8">
          <h1 className="text-lg font-semibold tracking-tight">Developer</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Triage today's work and reflect on your output across GitHub, Claude
            Code, and Codex.
          </p>
        </header>
        {body()}
      </div>
    );
  };
  return DeveloperScreen;
};
