// An agent run: one command (an agent CLI, or any command) executing in
// its own git worktree, attached to a real PTY so its terminal is live-
// viewable, and producing a reviewable git diff when it ends. This is the
// cmux primitive: fan a task out into several runs, watch them, keep the
// best. Reuses the terminal's PtySession for I/O and the WorktreeManager
// for isolation. Arbitrary command execution: the host route gates it.

import { type EntityStore, ulid } from "@halero/core";
import { AGENT_RUN_KIND } from "@halero/schemas";
import { PtySession } from "../terminal/session";
import type { Worktree, WorktreeDiff, WorktreeManager } from "./worktree";

export type RunStatus = "running" | "succeeded" | "failed";

export interface AgentRunResult {
  readonly status: RunStatus;
  readonly exitCode: number;
  readonly diff: WorktreeDiff;
}

export interface RunChangeSummary {
  readonly files: number;
  readonly insertions: number;
  readonly deletions: number;
}

export interface AgentRunInfo {
  readonly id: string;
  /** Which agent this run is (e.g. "claude"), for display. */
  readonly label: string;
  readonly branch: string;
  readonly status: RunStatus;
  readonly createdAt: number;
  readonly exitCode: number | null;
  /** Change totals once the run has settled; null while running. */
  readonly changed: RunChangeSummary | null;
  /** The agent.run spine entity id, or null when persistence is off. */
  readonly entityId: string | null;
}

export interface StartRunOptions {
  readonly id?: string;
  /** Display label for the run, e.g. the agent id. */
  readonly label?: string;
  /** Title for the run's spine entity (e.g. the prompt); persisted if set. */
  readonly title?: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly cols?: number;
  readonly rows?: number;
}

interface AgentRunDeps {
  readonly id: string;
  readonly label: string;
  readonly entityId: string | null;
  readonly worktree: Worktree;
  readonly session: PtySession;
  readonly createdAt: number;
  readonly base: string;
  readonly worktrees: WorktreeManager;
}

export class AgentRun {
  readonly id: string;
  readonly label: string;
  /** The agent.run spine entity id, or null when persistence is off. */
  readonly entityId: string | null;
  readonly branch: string;
  readonly path: string;
  readonly createdAt: number;
  /** Resolves once the command exits and its diff has been computed. */
  readonly completion: Promise<AgentRunResult>;
  readonly #session: PtySession;
  #status: RunStatus = "running";
  #exitCode: number | null = null;
  #output = "";
  #result: AgentRunResult | null = null;

  constructor(deps: AgentRunDeps) {
    this.id = deps.id;
    this.label = deps.label;
    this.entityId = deps.entityId;
    this.branch = deps.worktree.branch;
    this.path = deps.worktree.path;
    this.createdAt = deps.createdAt;
    this.#session = deps.session;
    // Accumulate the agent's terminal output so a run's log is fetchable
    // even by a client that connects after it started.
    deps.session.onData((chunk) => {
      this.#output += chunk;
    });
    this.completion = deps.session.exited.then(async (code) => {
      this.#exitCode = code;
      this.#status = code === 0 ? "succeeded" : "failed";
      const diff = await deps.worktrees.diff(deps.worktree, deps.base);
      this.#result = { status: this.#status, exitCode: code, diff };
      return this.#result;
    });
  }

  get status(): RunStatus {
    return this.#status;
  }

  get exitCode(): number | null {
    return this.#exitCode;
  }

  /** The agent's terminal output so far. */
  output(): string {
    return this.#output;
  }

  /** The settled result (status, exit code, diff), or null while running. */
  result(): AgentRunResult | null {
    return this.#result;
  }

  onData(listener: (chunk: string) => void): void {
    this.#session.onData(listener);
  }

  write(data: string): void {
    this.#session.write(data);
  }

  resize(cols: number, rows: number): void {
    this.#session.resize(cols, rows);
  }

  kill(): void {
    this.#session.kill();
  }

  info(): AgentRunInfo {
    const diff = this.#result?.diff ?? null;
    return {
      id: this.id,
      label: this.label,
      branch: this.branch,
      status: this.#status,
      createdAt: this.createdAt,
      exitCode: this.#exitCode,
      changed:
        diff === null
          ? null
          : {
              files: diff.files.length,
              insertions: diff.insertions,
              deletions: diff.deletions,
            },
      entityId: this.entityId,
    };
  }
}

export interface AgentRunManagerOptions {
  readonly worktrees: WorktreeManager;
  /** The ref every run branches from (e.g. the repo's default branch). */
  readonly base: string;
  readonly maxRuns?: number;
  readonly now?: () => number;
  readonly env?: Record<string, string>;
  /**
   * When set, each run is recorded as an `agent.run` spine entity so it is
   * searchable, linkable, and timeline-able. Omit to keep runs in-memory
   * only (tests that do not exercise persistence).
   */
  readonly entities?: EntityStore;
}

const DEFAULT_MAX_RUNS = 4;
const TOO_MANY_MESSAGE =
  "Too many agent runs are active. Wait for one to finish or remove it.";

export class AgentRunManager {
  readonly #runs = new Map<string, AgentRun>();
  readonly #worktrees: WorktreeManager;
  readonly #base: string;
  readonly #maxRuns: number;
  readonly #now: () => number;
  readonly #env: Record<string, string> | undefined;
  readonly #entities: EntityStore | undefined;

  constructor(options: AgentRunManagerOptions) {
    this.#worktrees = options.worktrees;
    this.#base = options.base;
    this.#maxRuns = options.maxRuns ?? DEFAULT_MAX_RUNS;
    this.#now = options.now ?? (() => Date.now());
    this.#env = options.env;
    this.#entities = options.entities;
  }

  async start(options: StartRunOptions): Promise<AgentRun> {
    if (this.#runs.size >= this.#maxRuns) {
      throw new Error(TOO_MANY_MESSAGE);
    }
    const id = options.id ?? ulid();
    const createdAt = this.#now();
    // Record the run on the spine before spawning, so a run always has its
    // durable object even if the process is short-lived.
    const entityId =
      this.#entities === undefined
        ? null
        : this.#entities.createUserEntity({
            kind: AGENT_RUN_KIND,
            schemaVersion: 1,
            title: options.title ?? options.label ?? options.command,
            occurredStart: createdAt,
          }).entityId;
    const worktree = await this.#worktrees.create({ id, base: this.#base });
    const session = PtySession.start({
      command: options.command,
      args: options.args,
      cols: options.cols,
      rows: options.rows,
      cwd: worktree.path,
      env: this.#env,
    });
    const run = new AgentRun({
      id,
      label: options.label ?? options.command,
      entityId,
      worktree,
      session,
      createdAt,
      base: this.#base,
      worktrees: this.#worktrees,
    });
    this.#runs.set(id, run);
    return run;
  }

  get(id: string): AgentRun | undefined {
    return this.#runs.get(id);
  }

  list(): AgentRunInfo[] {
    return [...this.#runs.values()].map((run) => run.info());
  }

  /** Kills the run (if live), waits for it to settle, and drops its worktree. */
  async remove(id: string): Promise<void> {
    const run = this.#runs.get(id);
    if (run === undefined) {
      return;
    }
    run.kill();
    await run.completion.catch(() => undefined);
    this.#runs.delete(id);
    await this.#worktrees.remove({
      id: run.id,
      path: run.path,
      branch: run.branch,
    });
  }
}
