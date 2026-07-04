import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunManager } from "./agent-run";
import { WorktreeManager } from "./worktree";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@halero.local",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@halero.local",
} as Record<string, string>;

const git = async (args: readonly string[], cwd: string): Promise<void> => {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    env: GIT_ENV,
    stdout: "ignore",
    stderr: "ignore",
  });
  if ((await proc.exited) !== 0) {
    throw new Error(`git ${args.join(" ")} failed`);
  }
};

const makeManager = async (maxRuns?: number): Promise<AgentRunManager> => {
  const repoPath = mkdtempSync(join(tmpdir(), "halero-run-repo-"));
  await git(["init", "-b", "main"], repoPath);
  writeFileSync(join(repoPath, "README.md"), "base\n");
  await git(["add", "-A"], repoPath);
  await git(["commit", "-m", "base"], repoPath);
  const worktreesDir = mkdtempSync(join(tmpdir(), "halero-run-trees-"));
  const worktrees = new WorktreeManager({
    repoPath,
    worktreesDir,
    env: GIT_ENV,
  });
  return new AgentRunManager({
    worktrees,
    base: "main",
    maxRuns,
    env: GIT_ENV,
  });
};

describe("AgentRunManager", () => {
  test("runs an agent in a worktree and reports its diff on success", async () => {
    const manager = await makeManager();
    const run = await manager.start({
      command: "/bin/sh",
      args: ["-c", "printf 'export const x = 1;\\n' > added.ts"],
    });

    const result = await run.completion;
    expect(result.status).toBe("succeeded");
    expect(result.exitCode).toBe(0);
    expect(result.diff.files).toContain("added.ts");
    expect(result.diff.patch).toContain("export const x = 1;");

    await manager.remove(run.id);
  });

  test("marks a run failed when its command exits nonzero", async () => {
    const manager = await makeManager();
    const run = await manager.start({
      command: "/bin/sh",
      args: ["-c", "exit 3"],
    });

    const result = await run.completion;
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(3);

    await manager.remove(run.id);
  });

  test("tracks runs by id and lists them", async () => {
    const manager = await makeManager();
    const run = await manager.start({
      command: "/bin/sh",
      args: ["-c", "sleep 0.3"],
    });

    expect(manager.get(run.id)?.id).toBe(run.id);
    expect(manager.list().map((info) => info.id)).toContain(run.id);
    expect(manager.list()[0]?.status).toBe("running");

    await run.completion;
    await manager.remove(run.id);
    expect(manager.get(run.id)).toBeUndefined();
  });

  test("enforces the max concurrent run limit", async () => {
    const manager = await makeManager(1);
    const run = await manager.start({
      command: "/bin/sh",
      args: ["-c", "sleep 0.5"],
    });

    await expect(
      manager.start({ command: "/bin/sh", args: ["-c", "true"] }),
    ).rejects.toThrow(/limit|maximum|too many/i);

    await manager.remove(run.id);
  });
});
