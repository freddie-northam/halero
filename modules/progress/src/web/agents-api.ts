// The agent-orchestration seam the Developer page's Agents tab consumes,
// wired by the host registry from the agents.* tRPC router. Kept separate
// from ProgressApi: agents are a host capability, not a progress concern.
// This module never imports the tRPC client or @halero/db.

export interface AgentInfo {
  readonly id: string;
  readonly label: string;
}

export type RunStatus = "running" | "succeeded" | "failed";

export interface RunChangeSummary {
  readonly files: number;
  readonly insertions: number;
  readonly deletions: number;
}

export interface RunInfo {
  readonly id: string;
  readonly label: string;
  readonly branch: string;
  readonly status: RunStatus;
  readonly createdAt: number;
  readonly exitCode: number | null;
  readonly changed: RunChangeSummary | null;
}

export interface RunDiff {
  readonly files: readonly string[];
  readonly patch: string;
  readonly insertions: number;
  readonly deletions: number;
}

export interface RunDetail {
  readonly id: string;
  readonly label: string;
  readonly branch: string;
  readonly status: RunStatus;
  readonly exitCode: number | null;
  readonly output: string;
  /** Change totals, available even for a persisted historical run. */
  readonly changed: RunChangeSummary | null;
  /** The full diff patch for a live run; null once it is historical. */
  readonly diff: RunDiff | null;
}

export interface StartRunsInput {
  readonly prompt: string;
  readonly agentIds: readonly string[];
}

export interface AgentsApi {
  readonly catalog: () => Promise<{
    readonly enabled: boolean;
    readonly agents: readonly AgentInfo[];
  }>;
  readonly start: (input: StartRunsInput) => Promise<{
    readonly runs: readonly RunInfo[];
  }>;
  readonly list: () => Promise<{
    readonly enabled: boolean;
    readonly runs: readonly RunInfo[];
  }>;
  readonly get: (id: string) => Promise<RunDetail>;
  readonly remove: (id: string) => Promise<void>;
}
