// An agent run: one command (an agent CLI, or any command) executing in
// its own git worktree, attached to a real PTY so its terminal is live-
// viewable, and producing a reviewable git diff when it ends. This is the
// cmux primitive: fan a task out into several runs, watch them, keep the
// best. Reuses the terminal's PtySession for I/O and the WorktreeManager
// for isolation. Arbitrary command execution: the host route gates it.

import { type EntityStore, ulid } from "@halero/core";
import { agentRuns, type HaleroDatabase } from "@halero/db";
import { AGENT_RUN_KIND } from "@halero/schemas";
import { eq } from "drizzle-orm";
import { PtySession } from "../terminal/session";
import type { Worktree, WorktreeDiff, WorktreeManager } from "./worktree";

type Db = HaleroDatabase["db"];

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

/**
 * A run's detail, unified across a live run (full output + diff patch) and
 * a persisted historical one (stats only; the worktree and PTY are gone).
 */
export interface RunDetailSnapshot {
  readonly id: string;
  readonly label: string;
  readonly branch: string;
  readonly status: RunStatus;
  readonly exitCode: number | null;
  readonly output: string;
  readonly changed: RunChangeSummary | null;
  /** The full diff for a live run; null for a persisted historical run. */
  readonly diff: WorktreeDiff | null;
}

interface PersistedRun {
  readonly runId: string;
  readonly entityId: string;
  readonly label: string;
  readonly branch: string;
  readonly status: RunStatus;
  readonly exitCode: number | null;
  readonly createdAt: number;
  readonly changed: RunChangeSummary | null;
}

const persistedInfo = (run: PersistedRun): AgentRunInfo => ({
  id: run.runId,
  label: run.label,
  branch: run.branch,
  status: run.status,
  createdAt: run.createdAt,
  exitCode: run.exitCode,
  changed: run.changed,
  entityId: run.entityId,
});

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
  /**
   * When set alongside `entities`, each run's durable fields are written to
   * the agent_runs satellite (status + diff stats), atomically with the
   * spine entity, so a run's outcome survives a restart.
   */
  readonly db?: Db;
  /** The repository runs operate on, recorded on each run's satellite row. */
  readonly repo?: string;
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
  readonly #db: Db | undefined;
  readonly #repo: string;
  /** Runs persisted by an earlier process, surfaced as historical entries. */
  readonly #persisted = new Map<string, PersistedRun>();

  constructor(options: AgentRunManagerOptions) {
    this.#worktrees = options.worktrees;
    this.#base = options.base;
    this.#maxRuns = options.maxRuns ?? DEFAULT_MAX_RUNS;
    this.#now = options.now ?? (() => Date.now());
    this.#env = options.env;
    this.#entities = options.entities;
    this.#db = options.db;
    this.#repo = options.repo ?? "";
    this.#loadPersisted();
  }

  #loadPersisted(): void {
    const db = this.#db;
    if (db === undefined) {
      return;
    }
    for (const row of db.select().from(agentRuns).all()) {
      this.#persisted.set(row.runId, {
        runId: row.runId,
        entityId: row.entityId,
        label: row.agentId,
        branch: row.branch,
        status: row.status,
        exitCode: row.exitCode,
        createdAt: row.createdAt,
        changed:
          row.files === null
            ? null
            : {
                files: row.files,
                insertions: row.insertions ?? 0,
                deletions: row.deletions ?? 0,
              },
      });
    }
  }

  async start(options: StartRunOptions): Promise<AgentRun> {
    if (this.#runs.size >= this.#maxRuns) {
      throw new Error(TOO_MANY_MESSAGE);
    }
    const id = options.id ?? ulid();
    const createdAt = this.#now();
    const worktree = await this.#worktrees.create({ id, base: this.#base });
    // Record the run on the spine (and satellite, if a db is set) before
    // spawning, so a run always has its durable object even if short-lived.
    const entityId = this.#persistStart(id, worktree, options, createdAt);
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
    if (entityId !== null) {
      this.#recordSettle(run, entityId);
    }
    return run;
  }

  /**
   * Creates the run's spine entity, and (when a db is set) its satellite row
   * atomically, returning the entity id. Null when persistence is off.
   */
  #persistStart(
    id: string,
    worktree: Worktree,
    options: StartRunOptions,
    createdAt: number,
  ): string | null {
    const entities = this.#entities;
    if (entities === undefined) {
      return null;
    }
    const title = options.title ?? options.label ?? options.command;
    const create = () =>
      entities.createUserEntity({
        kind: AGENT_RUN_KIND,
        schemaVersion: 1,
        title,
        occurredStart: createdAt,
      }).entityId;
    const db = this.#db;
    if (db === undefined) {
      return create();
    }
    return entities.withTransaction(() => {
      const entityId = create();
      db.insert(agentRuns)
        .values({
          entityId,
          runId: id,
          agentId: options.label ?? "agent",
          repo: this.#repo,
          branch: worktree.branch,
          status: "running",
          createdAt,
        })
        .run();
      return entityId;
    });
  }

  /** Writes the run's outcome to its satellite once it settles. */
  #recordSettle(run: AgentRun, entityId: string): void {
    const db = this.#db;
    if (db === undefined) {
      return;
    }
    void run.completion
      .then((result) => {
        db.update(agentRuns)
          .set({
            status: result.status,
            exitCode: result.exitCode,
            files: result.diff.files.length,
            insertions: result.diff.insertions,
            deletions: result.diff.deletions,
            endedAt: this.#now(),
          })
          .where(eq(agentRuns.entityId, entityId))
          .run();
      })
      .catch(() => undefined);
  }

  /** The LIVE run (with its PTY), for the streaming WS. Historical runs
   * are not live and are reached through detail(). */
  get(id: string): AgentRun | undefined {
    return this.#runs.get(id);
  }

  /** Every run, newest state wins: live runs override persisted history. */
  list(): AgentRunInfo[] {
    const byId = new Map<string, AgentRunInfo>();
    for (const persisted of this.#persisted.values()) {
      byId.set(persisted.runId, persistedInfo(persisted));
    }
    for (const run of this.#runs.values()) {
      byId.set(run.id, run.info());
    }
    return [...byId.values()];
  }

  /** A run's detail, live if in-process else the persisted historical view. */
  detail(id: string): RunDetailSnapshot | null {
    const live = this.#runs.get(id);
    if (live !== undefined) {
      return {
        id: live.id,
        label: live.label,
        branch: live.branch,
        status: live.status,
        exitCode: live.exitCode,
        output: live.output(),
        changed: live.info().changed,
        diff: live.result()?.diff ?? null,
      };
    }
    const persisted = this.#persisted.get(id);
    if (persisted === undefined) {
      return null;
    }
    return {
      id: persisted.runId,
      label: persisted.label,
      branch: persisted.branch,
      status: persisted.status,
      exitCode: persisted.exitCode,
      output: "",
      changed: persisted.changed,
      diff: null,
    };
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
