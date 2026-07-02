import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeTestApp, type TestApp } from "../test-utils";
import {
  createMaintenanceJob,
  type MaintenanceContext,
  runDailyBackup,
} from "./maintenance";
import { createSyncRunner } from "./runner";
import { createScheduler, type SchedulerContext } from "./scheduler";

// clock.value = 1_700_000_000_000 is 2023-11-14 UTC.
const TODAY_FILE = "halero-2023-11-14.db";

const makeMaintenance = (
  testApp: TestApp,
): { ctx: MaintenanceContext; backupsDir: string; logs: string[] } => {
  const backupsDir = join(testApp.dir, "backups");
  const logs: string[] = [];
  return {
    backupsDir,
    logs,
    ctx: {
      sqlite: testApp.database.sqlite,
      backupsDir,
      now: () => testApp.clock.value,
      log: (message) => logs.push(message),
    },
  };
};

const dailyFiles = (backupsDir: string): string[] =>
  readdirSync(backupsDir)
    .filter((file) => /^halero-\d{4}-\d{2}-\d{2}\.db$/.test(file))
    .sort();

describe("runDailyBackup", () => {
  test("writes a dated snapshot that is a readable database", () => {
    const testApp = makeTestApp();
    const { ctx, backupsDir } = makeMaintenance(testApp);

    runDailyBackup(ctx);

    const path = join(backupsDir, TODAY_FILE);
    expect(existsSync(path)).toBe(true);
    const snapshot = new Database(path, { readonly: true });
    const row = snapshot
      .query<{ total: number }, []>(
        "SELECT count(*) AS total FROM schema_migrations",
      )
      .get();
    snapshot.close();
    expect(row?.total ?? 0).toBeGreaterThan(0);
  });

  test("prunes to the newest 7 daily snapshots", () => {
    const testApp = makeTestApp();
    const { ctx, backupsDir } = makeMaintenance(testApp);
    mkdirSync(backupsDir, { recursive: true });
    for (let day = 1; day <= 8; day += 1) {
      const name = `halero-2023-11-${String(day).padStart(2, "0")}.db`;
      writeFileSync(join(backupsDir, name), "old backup");
    }

    runDailyBackup(ctx);

    const kept = dailyFiles(backupsDir);
    expect(kept).toHaveLength(7);
    expect(kept).toContain(TODAY_FILE);
    expect(kept).toContain("halero-2023-11-08.db");
    // The two oldest fell off the end.
    expect(kept).not.toContain("halero-2023-11-01.db");
    expect(kept).not.toContain("halero-2023-11-02.db");
  });

  test("never touches pre-migration snapshots or unrelated files", () => {
    const testApp = makeTestApp();
    const { ctx, backupsDir } = makeMaintenance(testApp);
    mkdirSync(backupsDir, { recursive: true });
    writeFileSync(join(backupsDir, "pre-0002_backoff-123.db"), "pre snapshot");
    writeFileSync(join(backupsDir, "keep-me.txt"), "not a backup");
    for (let day = 1; day <= 9; day += 1) {
      const name = `halero-2023-11-${String(day).padStart(2, "0")}.db`;
      writeFileSync(join(backupsDir, name), "old backup");
    }

    runDailyBackup(ctx);

    expect(existsSync(join(backupsDir, "pre-0002_backoff-123.db"))).toBe(true);
    expect(existsSync(join(backupsDir, "keep-me.txt"))).toBe(true);
    expect(dailyFiles(backupsDir)).toHaveLength(7);
  });

  test("skips without throwing when today's snapshot already exists", () => {
    const testApp = makeTestApp();
    const { ctx, backupsDir, logs } = makeMaintenance(testApp);
    mkdirSync(backupsDir, { recursive: true });
    writeFileSync(join(backupsDir, TODAY_FILE), "already made today");

    expect(() => runDailyBackup(ctx)).not.toThrow();

    // The existing file is untouched, and the skip is visible in logs.
    const content = readdirSync(backupsDir);
    expect(content).toContain(TODAY_FILE);
    expect(Bun.file(join(backupsDir, TODAY_FILE)).size).toBe(
      "already made today".length,
    );
    expect(logs.some((line) => line.includes("already exists"))).toBe(true);
  });
});

describe("createMaintenanceJob", () => {
  test("start() arms the daily cron and stop() cancels it", () => {
    const testApp = makeTestApp();
    const { ctx } = makeMaintenance(testApp);
    const job = createMaintenanceJob(ctx);

    expect(job.isRunning()).toBe(false);
    job.start();
    expect(job.isRunning()).toBe(true);
    job.start();
    expect(job.isRunning()).toBe(true);
    job.stop();
    expect(job.isRunning()).toBe(false);
    job.stop();
    expect(job.isRunning()).toBe(false);
  });
});

describe("scheduler lifecycle wiring", () => {
  test("the scheduler starts and stops the maintenance job with itself", () => {
    const testApp = makeTestApp();
    const runner = createSyncRunner({
      database: testApp.database,
      key: testApp.key,
      now: () => testApp.clock.value,
      outboundFetch: () => Promise.resolve(new Response("{}")),
      random: () => 0.5,
    });
    const ctx: SchedulerContext = {
      db: testApp.database.db,
      now: () => testApp.clock.value,
      runner,
    };
    const events: string[] = [];
    const maintenance = {
      start: () => events.push("start"),
      stop: () => events.push("stop"),
      isRunning: () => false,
    };
    const scheduler = createScheduler(ctx, { maintenance });

    scheduler.start();
    scheduler.stop();

    expect(events).toEqual(["start", "stop"]);
  });
});
