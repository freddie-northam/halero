// The Developer page's Agents tab: fan a prompt out to one or more coding
// agents, each running in its own git worktree, then watch their status
// and review each run's diff. Data comes through the host-wired AgentsApi;
// runs poll while any is still running. Off unless the instance opted in
// (HALERO_DEVELOPER_TERMINAL + HALERO_AGENTS_REPO), in which case it
// explains how to enable it.

import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  Separator,
  Skeleton,
} from "@halero/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactElement, useState } from "react";
import type { AgentsApi, RunInfo, RunStatus } from "../agents-api";

const RUNS_KEY = ["agent-runs"] as const;
const POLL_MS = 2000;

const statusTone: Record<RunStatus, string> = {
  running: "text-amber-500",
  succeeded: "text-emerald-500",
  failed: "text-destructive",
};

const anyRunning = (runs: readonly RunInfo[]): boolean =>
  runs.some((run) => run.status === "running");

const NewRunForm = ({
  api,
  agentIds,
  onStarted,
}: {
  readonly api: AgentsApi;
  readonly agentIds: readonly { readonly id: string; readonly label: string }[];
  readonly onStarted: () => void;
}): ReactElement => {
  const [selected, setSelected] = useState<readonly string[]>(
    agentIds.length > 0 ? [agentIds[0]?.id ?? ""] : [],
  );
  const [error, setError] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: (input: { prompt: string; agentIds: readonly string[] }) =>
      api.start(input),
    onSuccess: () => {
      setError(null);
      onStarted();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Could not start the run."),
  });

  const toggle = (id: string): void =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const prompt = String(
      new FormData(event.currentTarget).get("prompt") ?? "",
    ).trim();
    if (prompt === "" || selected.length === 0) {
      setError("Enter a prompt and pick at least one agent.");
      return;
    }
    start.mutate({ prompt, agentIds: selected });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <textarea
        name="prompt"
        aria-label="Prompt"
        placeholder="Describe the change to make..."
        className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap items-center gap-3">
        {agentIds.map((agent) => (
          <label
            key={agent.id}
            className="flex items-center gap-2 text-sm"
            htmlFor={`agent-${agent.id}`}
          >
            <Checkbox
              id={`agent-${agent.id}`}
              checked={selected.includes(agent.id)}
              onCheckedChange={() => toggle(agent.id)}
            />
            {agent.label}
          </label>
        ))}
        <Button type="submit" size="sm" disabled={start.isPending}>
          {start.isPending ? "Starting..." : "Run"}
        </Button>
      </div>
      {error === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
};

const RunDetail = ({
  api,
  runId,
}: {
  readonly api: AgentsApi;
  readonly runId: string;
}): ReactElement => {
  const detail = useQuery({
    queryKey: ["agent-run", runId],
    queryFn: () => api.get(runId),
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? POLL_MS : false,
  });
  if (detail.data === undefined) {
    return <Skeleton className="h-40 w-full" />;
  }
  const run = detail.data;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <Badge variant="secondary">{run.label}</Badge>
        <span className={statusTone[run.status]}>{run.status}</span>
        <code className="text-muted-foreground text-xs">{run.branch}</code>
      </div>
      {run.diff !== null && run.diff.files.length > 0 ? (
        <div>
          <p className="mb-1 flex items-center gap-2 font-medium text-sm">
            <span>Changed files ({run.diff.files.length})</span>
            <span className="font-normal text-emerald-500 text-xs">
              +{run.diff.insertions}
            </span>
            <span className="font-normal text-destructive text-xs">
              -{run.diff.deletions}
            </span>
          </p>
          <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
            {run.diff.patch}
          </pre>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          {run.status === "running"
            ? "Running..."
            : "No file changes were produced."}
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-muted-foreground text-sm">
          Output
        </summary>
        <pre className="mt-1 max-h-72 overflow-auto rounded-md border bg-black/80 p-2 text-white/80 text-xs">
          {run.output || "(no output yet)"}
        </pre>
      </details>
    </div>
  );
};

/** The Agents tab, built around the host-wired AgentsApi. */
export const AgentsTab = ({
  api,
}: {
  readonly api: AgentsApi;
}): ReactElement => {
  const queryClient = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  const catalog = useQuery({
    queryKey: ["agent-catalog"],
    queryFn: () => api.catalog(),
  });
  const runs = useQuery({
    queryKey: RUNS_KEY,
    queryFn: () => api.list(),
    refetchInterval: (query) =>
      query.state.data && anyRunning(query.state.data.runs) ? POLL_MS : false,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RUNS_KEY }),
  });

  if (catalog.data === undefined) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (!catalog.data.enabled) {
    return (
      <Alert>
        <AlertDescription>
          Agent orchestration is off. Set{" "}
          <code>HALERO_DEVELOPER_TERMINAL=1</code> and{" "}
          <code>HALERO_AGENTS_REPO</code> to a git repository, then restart
          Halero. Agents run locally in isolated worktrees and never touch your
          working tree.
        </AlertDescription>
      </Alert>
    );
  }

  const runList = runs.data?.runs ?? [];
  return (
    <div className="flex flex-col gap-4">
      <NewRunForm
        api={api}
        agentIds={catalog.data.agents}
        onStarted={() => queryClient.invalidateQueries({ queryKey: RUNS_KEY })}
      />
      <Separator />
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <ul className="flex flex-col gap-1">
          {runList.length === 0 ? (
            <li className="text-muted-foreground text-sm">No runs yet.</li>
          ) : (
            runList.map((run) => (
              <li key={run.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedRun(run.id)}
                  className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span className={`text-xs ${statusTone[run.status]}`}>●</span>
                  <span className="truncate">{run.label}</span>
                  {run.changed === null ? null : (
                    <span className="ml-auto shrink-0 text-xs tabular-nums">
                      <span className="text-emerald-500">
                        +{run.changed.insertions}
                      </span>{" "}
                      <span className="text-destructive">
                        -{run.changed.deletions}
                      </span>
                    </span>
                  )}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Remove run"
                  onClick={() => {
                    if (selectedRun === run.id) {
                      setSelectedRun(null);
                    }
                    remove.mutate(run.id);
                  }}
                >
                  ✕
                </Button>
              </li>
            ))
          )}
        </ul>
        {selectedRun === null ? (
          <p className="text-muted-foreground text-sm">
            Select a run to see its diff and output.
          </p>
        ) : (
          <RunDetail api={api} runId={selectedRun} />
        )}
      </div>
    </div>
  );
};
