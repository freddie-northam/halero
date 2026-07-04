// An agent run: one command (an agent CLI, or any command) executing in
// its own git worktree, attached to a real PTY so its terminal is live-
// viewable, and producing a reviewable git diff when it ends. This is the
// cmux primitive: fan a task out into several runs, watch them, keep the
// best. Reuses the terminal's PtySession for I/O and the WorktreeManager
// for isolation. Arbitrary command execution: the host route gates it.

import { ulid } from "@halero/core";
import { PtySession } from "../terminal/session";
import type { Worktree, WorktreeDiff, WorktreeManager } from "./worktree";

export type RunStatus = "running" | "succeeded" | "failed";

export interface AgentRunResult {
  readonly status: RunStatus;
  readonly exitCode: number;
  readonly diff: WorktreeDiff;
}

export interface AgentRunInfo {
  readonly id: string;
  readonly branch: string;
  readonly status: RunStatus;
  readonly createdAt: number;
  readonly exitCode: number | null;
}

export interface StartRunOptions {
  readonly id?: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly cols?: number;
  readonly rows?: number;
}

interface AgentRunDeps {
  readonly id: string;
  readonly worktree: Worktree;
  readonly session: PtySession;
  readonly createdAt: number;
  readonly base: string;
  readonly worktrees: WorktreeManager;
}

export class AgentRun {
  readonly id: string;
  readonly branch: string;
  readonly path: string;
  readonly createdAt: number;
  /** Resolves once the command exits and its diff has been computed. */
  readonly completion: Promise<AgentRunResult>;
  readonly #session: PtySession;
  #status: RunStatus = "running";
  #exitCode: number | null = null;

  constructor(deps: AgentRunDeps) {
    this.id = deps.id;
    this.branch = deps.worktree.branch;
    this.path = deps.worktree.path;
    this.createdAt = deps.createdAt;
    this.#session = deps.session;
    this.completion = deps.session.exited.then(async (code) => {
      this.#exitCode = code;
      this.#status = code === 0 ? "succeeded" : "failed";
      const diff = await deps.worktrees.diff(deps.worktree, deps.base);
      return { status: this.#status, exitCode: code, diff };
    });
  }

  get status(): RunStatus {
    return this.#status;
  }

  get exitCode(): number | null {
    return this.#exitCode;
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
    return {
      id: this.id,
      branch: this.branch,
      status: this.#status,
      createdAt: this.createdAt,
      exitCode: this.#exitCode,
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

  constructor(options: AgentRunManagerOptions) {
    this.#worktrees = options.worktrees;
    this.#base = options.base;
    this.#maxRuns = options.maxRuns ?? DEFAULT_MAX_RUNS;
    this.#now = options.now ?? (() => Date.now());
    this.#env = options.env;
  }

  async start(options: StartRunOptions): Promise<AgentRun> {
    if (this.#runs.size >= this.#maxRuns) {
      throw new Error(TOO_MANY_MESSAGE);
    }
    const id = options.id ?? ulid();
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
      worktree,
      session,
      createdAt: this.#now(),
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
