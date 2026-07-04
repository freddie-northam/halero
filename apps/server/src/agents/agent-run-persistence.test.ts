import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEntityStore } from "@halero/core";
import {
  agentRuns,
  coreMigrations,
  entities,
  openDatabase,
  runMigrations,
} from "@halero/db";
import { AGENT_RUN_KIND } from "@halero/schemas";
import { eq } from "drizzle-orm";
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

const makeWorktrees = async (): Promise<WorktreeManager> => {
  const repoPath = mkdtempSync(join(tmpdir(), "halero-persist-repo-"));
  await git(["init", "-b", "main"], repoPath);
  writeFileSync(join(repoPath, "README.md"), "base\n");
  await git(["add", "-A"], repoPath);
  await git(["commit", "-m", "base"], repoPath);
  const worktreesDir = mkdtempSync(join(tmpdir(), "halero-persist-trees-"));
  return new WorktreeManager({ repoPath, worktreesDir, env: GIT_ENV });
};

const makeDb = () => {
  const dir = mkdtempSync(join(tmpdir(), "halero-persist-db-"));
  const database = openDatabase(join(dir, "halero.db"));
  runMigrations(database.sqlite, {
    migrations: coreMigrations,
    backupsDir: join(dir, "backups"),
  });
  return database;
};

describe("AgentRunManager persistence", () => {
  test("records each run as an agent.run entity titled with the prompt", async () => {
    const worktrees = await makeWorktrees();
    const database = makeDb();
    const manager = new AgentRunManager({
      worktrees,
      base: "main",
      env: GIT_ENV,
      now: () => 1000,
      entities: createEntityStore(database),
    });

    const run = await manager.start({
      title: "claude: fix the flaky test",
      command: "/bin/sh",
      args: ["-c", "true"],
    });

    expect(run.entityId).not.toBeNull();
    const row = database.db
      .select()
      .from(entities)
      .where(eq(entities.id, run.entityId ?? ""))
      .get();
    expect(row?.kind).toBe(AGENT_RUN_KIND);
    expect(row?.title).toBe("claude: fix the flaky test");
    expect(row?.occurredStart).toBe(1000);
    expect(run.info().entityId).toBe(run.entityId);

    await run.completion;
    await manager.remove(run.id);
  });

  test("writes the agent_runs satellite on start and updates it on settle", async () => {
    const worktrees = await makeWorktrees();
    const database = makeDb();
    const manager = new AgentRunManager({
      worktrees,
      base: "main",
      env: GIT_ENV,
      now: () => 2000,
      entities: createEntityStore(database),
      db: database.db,
      repo: "/repos/demo",
    });

    const run = await manager.start({
      label: "claude",
      title: "claude: add a file",
      command: "/bin/sh",
      args: ["-c", "printf 'hi\\n' > added.txt"],
    });

    const started = database.db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.entityId, run.entityId ?? ""))
      .get();
    expect(started?.status).toBe("running");
    expect(started?.runId).toBe(run.id);
    expect(started?.agentId).toBe("claude");
    expect(started?.repo).toBe("/repos/demo");
    expect(started?.branch).toBe(run.branch);

    await run.completion;
    await Bun.sleep(30);
    const settled = database.db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.entityId, run.entityId ?? ""))
      .get();
    expect(settled?.status).toBe("succeeded");
    expect(settled?.exitCode).toBe(0);
    expect(settled?.files).toBe(1);
    expect(settled?.insertions).toBe(1);
    expect(settled?.endedAt).not.toBeNull();

    await manager.remove(run.id);
  });

  test("surfaces a prior-process run from the satellite on construction", async () => {
    const worktrees = await makeWorktrees();
    const database = makeDb();
    const entities = createEntityStore(database);
    // Simulate a run persisted by a previous process, now settled.
    const { entityId } = entities.createUserEntity({
      kind: AGENT_RUN_KIND,
      schemaVersion: 1,
      title: "claude: an old run",
      occurredStart: 500,
    });
    database.db
      .insert(agentRuns)
      .values({
        entityId,
        runId: "old-run-1",
        agentId: "claude",
        repo: "/repos/demo",
        branch: "halero/run-old-run-1",
        status: "succeeded",
        exitCode: 0,
        files: 3,
        insertions: 10,
        deletions: 2,
        createdAt: 500,
        endedAt: 600,
      })
      .run();

    // A fresh manager (a new process) loads and surfaces it.
    const manager = new AgentRunManager({
      worktrees,
      base: "main",
      env: GIT_ENV,
      entities,
      db: database.db,
      repo: "/repos/demo",
    });

    const old = manager.list().find((run) => run.id === "old-run-1");
    expect(old?.status).toBe("succeeded");
    expect(old?.label).toBe("claude");
    expect(old?.entityId).toBe(entityId);
    expect(old?.changed).toEqual({ files: 3, insertions: 10, deletions: 2 });

    const detail = manager.detail("old-run-1");
    expect(detail?.status).toBe("succeeded");
    expect(detail?.output).toBe("");
    expect(detail?.diff).toBeNull();
    expect(detail?.changed).toEqual({ files: 3, insertions: 10, deletions: 2 });
  });

  test("skips persistence (entityId null) when no entity store is given", async () => {
    const worktrees = await makeWorktrees();
    const manager = new AgentRunManager({
      worktrees,
      base: "main",
      env: GIT_ENV,
    });

    const run = await manager.start({
      command: "/bin/sh",
      args: ["-c", "true"],
    });
    expect(run.entityId).toBeNull();

    await run.completion;
    await manager.remove(run.id);
  });
});
