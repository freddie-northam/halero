// Git worktree isolation for agent runs. Each run gets its own worktree
// on a fresh branch off a base ref, so parallel agents never touch each
// other's files or the user's working tree. Docker-free on purpose: it
// fits Halero's single-process model (the cmux/coder approach). Diffs
// come straight from git so a run's changes can be reviewed before merge.

import { rm } from "node:fs/promises";
import { join } from "node:path";

export interface WorktreeManagerOptions {
  /** The git repository new worktrees branch from. */
  readonly repoPath: string;
  /** Parent directory the per-run worktrees are created under. */
  readonly worktreesDir: string;
  /** Environment for git (tests pin identity); defaults to the process env. */
  readonly env?: Record<string, string>;
}

export interface Worktree {
  readonly id: string;
  readonly path: string;
  readonly branch: string;
}

export interface WorktreeDiff {
  readonly files: readonly string[];
  readonly patch: string;
  readonly insertions: number;
  readonly deletions: number;
}

const BRANCH_PREFIX = "halero/run-";

interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Parses `git diff --numstat` into file list plus insertion/deletion totals. */
const parseNumstat = (
  numstat: string,
): { files: string[]; insertions: number; deletions: number } => {
  const files: string[] = [];
  let insertions = 0;
  let deletions = 0;
  for (const line of numstat.split("\n")) {
    const parts = line.trim().split("\t");
    if (parts.length < 3) {
      continue;
    }
    const [added, deleted, path] = parts as [string, string, string];
    files.push(path);
    // Binary files report "-"; count only numeric line changes.
    if (added !== "-") {
      insertions += Number.parseInt(added, 10) || 0;
    }
    if (deleted !== "-") {
      deletions += Number.parseInt(deleted, 10) || 0;
    }
  }
  return { files, insertions, deletions };
};

export class WorktreeManager {
  readonly #repoPath: string;
  readonly #worktreesDir: string;
  readonly #env: Record<string, string>;

  constructor(options: WorktreeManagerOptions) {
    this.#repoPath = options.repoPath;
    this.#worktreesDir = options.worktreesDir;
    this.#env = options.env ?? (process.env as Record<string, string>);
  }

  async #git(args: readonly string[], cwd: string): Promise<GitResult> {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      env: this.#env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const code = await proc.exited;
    return { code, stdout, stderr };
  }

  async #gitOrThrow(args: readonly string[], cwd: string): Promise<GitResult> {
    const result = await this.#git(args, cwd);
    if (result.code !== 0) {
      throw new Error(
        `git ${args[0]} failed: ${result.stderr.trim() || `exit ${result.code}`}`,
      );
    }
    return result;
  }

  /** The branch name a run's worktree lives on. */
  branchFor(id: string): string {
    return `${BRANCH_PREFIX}${id}`;
  }

  /** Creates a worktree for the run on a new branch off `base`. */
  async create(options: {
    readonly id: string;
    readonly base: string;
  }): Promise<Worktree> {
    const path = join(this.#worktreesDir, options.id);
    const branch = this.branchFor(options.id);
    await this.#gitOrThrow(
      ["worktree", "add", path, "-b", branch, options.base],
      this.#repoPath,
    );
    return { id: options.id, path, branch };
  }

  /**
   * The run's changes versus `base`, including newly created files. An
   * intent-to-add records untracked files in the index so `git diff` lists
   * them without staging their content or otherwise mutating the tree.
   */
  async diff(worktree: Worktree, base: string): Promise<WorktreeDiff> {
    await this.#git(["add", "-A", "-N"], worktree.path);
    const patch = (await this.#git(["diff", base], worktree.path)).stdout;
    const numstat = (
      await this.#git(["diff", base, "--numstat"], worktree.path)
    ).stdout;
    return { patch, ...parseNumstat(numstat) };
  }

  /** Removes the worktree and deletes its branch so the id is reusable. */
  async remove(worktree: Worktree): Promise<void> {
    await this.#git(
      ["worktree", "remove", "--force", worktree.path],
      this.#repoPath,
    );
    await this.#git(["branch", "-D", worktree.branch], this.#repoPath);
    await rm(worktree.path, { recursive: true, force: true });
  }
}
