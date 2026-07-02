// Daily database maintenance: a dated VACUUM INTO snapshot plus
// rotation. Backups must happen without the user thinking about them,
// and copying the live WAL file by hand is exactly the corruption trap
// the snapshot path exists to avoid.

import type { Database } from "bun:sqlite";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createSnapshot } from "@halero/db";
import { Cron } from "croner";

/** 03:00 server time, once a day. */
const DAILY_BACKUP_CRON = "0 3 * * *";

/** How many daily snapshots rotation keeps. */
export const RETAINED_BACKUPS = 7;

/**
 * Only files this job created are ever rotated. Pre-migration pre-*
 * snapshots and anything else in the directory are never touched.
 */
const DAILY_BACKUP_PATTERN = /^halero-\d{4}-\d{2}-\d{2}\.db$/;

export interface MaintenanceContext {
  readonly sqlite: Database;
  readonly backupsDir: string;
  readonly now: () => number;
  /** Sink for skip and failure lines; defaults to console.log. */
  readonly log?: (message: string) => void;
}

export interface MaintenanceJob {
  readonly start: () => void;
  readonly stop: () => void;
  readonly isRunning: () => boolean;
}

const dailyBackupFileName = (at: number): string =>
  `halero-${new Date(at).toISOString().slice(0, 10)}.db`;

const pruneDailyBackups = (backupsDir: string): void => {
  if (!existsSync(backupsDir)) {
    return;
  }
  const daily = readdirSync(backupsDir)
    .filter((file) => DAILY_BACKUP_PATTERN.test(file))
    // ISO date names sort lexically = chronologically; newest first.
    .sort()
    .reverse();
  for (const stale of daily.slice(RETAINED_BACKUPS)) {
    rmSync(join(backupsDir, stale), { force: true });
  }
};

/**
 * One maintenance pass: snapshot today's database (UTC date in the
 * name), then rotate. Re-running on the same day skips with a log line
 * instead of throwing, so a restarted server never fails its tick.
 */
export const runDailyBackup = (ctx: MaintenanceContext): void => {
  const log = ctx.log ?? ((message: string) => console.log(message));
  const target = join(ctx.backupsDir, dailyBackupFileName(ctx.now()));
  if (existsSync(target)) {
    log(`Skipping the daily backup: ${target} already exists.`);
    return;
  }
  createSnapshot(ctx.sqlite, target);
  log(`Backed up the database to ${target}.`);
  pruneDailyBackups(ctx.backupsDir);
};

const readableBackupError = (error: unknown): string =>
  error instanceof Error && error.message.trim() !== ""
    ? error.message
    : "The daily backup failed for an unknown reason.";

/**
 * The cron tick: one backup pass with the failure contained. A failed
 * backup must never take the process down; the next day's tick tries
 * again, and the failure lands in the injected log sink.
 */
export const runDailyBackupSafely = (ctx: MaintenanceContext): void => {
  const log = ctx.log ?? ((message: string) => console.log(message));
  try {
    runDailyBackup(ctx);
  } catch (error) {
    log(`The daily backup failed: ${readableBackupError(error)}`);
  }
};

/**
 * The daily maintenance cron. Started and stopped by the sync
 * scheduler's lifecycle so one switch controls all background work.
 */
export const createMaintenanceJob = (
  ctx: MaintenanceContext,
): MaintenanceJob => {
  // Croner jobs cannot restart after stop(), so start() builds a fresh
  // job each time (same pattern as the sync scheduler).
  let job: Cron | null = null;
  return {
    start: () => {
      if (job !== null && !job.isStopped()) {
        return;
      }
      job = new Cron(DAILY_BACKUP_CRON, () => runDailyBackupSafely(ctx));
    },
    stop: () => {
      job?.stop();
      job = null;
    },
    isRunning: () => job !== null && !job.isStopped(),
  };
};
