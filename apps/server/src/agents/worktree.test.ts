import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${code})`);
  }
};

const initRepo = async (): Promise<string> => {
  const dir = mkdtempSync(join(tmpdir(), "halero-wt-repo-"));
  await git(["init", "-b", "main"], dir);
  writeFileSync(join(dir, "README.md"), "base\n");
  await git(["add", "-A"], dir);
  await git(["commit", "-m", "base"], dir);
  return dir;
};

const makeManager = async (): Promise<WorktreeManager> => {
  const repoPath = await initRepo();
  const worktreesDir = mkdtempSync(join(tmpdir(), "halero-wt-trees-"));
  return new WorktreeManager({ repoPath, worktreesDir, env: GIT_ENV });
};

describe("WorktreeManager", () => {
  test("creates an isolated worktree on a fresh branch off base", async () => {
    const manager = await makeManager();
    const worktree = await manager.create({ id: "run1", base: "main" });

    expect(existsSync(worktree.path)).toBe(true);
    expect(existsSync(join(worktree.path, "README.md"))).toBe(true);
    expect(worktree.branch).toContain("run1");
    await manager.remove(worktree);
  });

  test("diff reports changed and newly added files vs base", async () => {
    const manager = await makeManager();
    const worktree = await manager.create({ id: "run2", base: "main" });

    writeFileSync(join(worktree.path, "README.md"), "base\nedited\n");
    writeFileSync(join(worktree.path, "new-file.ts"), "export const x = 1;\n");

    const diff = await manager.diff(worktree, "main");
    expect(diff.files).toContain("README.md");
    expect(diff.files).toContain("new-file.ts");
    expect(diff.patch).toContain("edited");
    expect(diff.patch).toContain("export const x = 1;");

    await manager.remove(worktree);
  });

  test("remove deletes the worktree directory and its branch", async () => {
    const manager = await makeManager();
    const worktree = await manager.create({ id: "run3", base: "main" });
    expect(existsSync(worktree.path)).toBe(true);

    await manager.remove(worktree);
    expect(existsSync(worktree.path)).toBe(false);
    // Recreating with the same id must succeed (branch was cleaned up).
    const again = await manager.create({ id: "run3", base: "main" });
    expect(existsSync(again.path)).toBe(true);
    await manager.remove(again);
  });
});
