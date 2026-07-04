// Shared helpers for local activity sources (Claude Code, Codex, Wispr
// Flow). Each such source reads a local log or database, collects event
// timestamps, and turns them into daily counts. The per-day bucketing and
// the trailing-year window live here once so the sources stay tiny.

import { existsSync, readFileSync } from "node:fs";
import { dateStringInZone } from "@halero/connector-sdk";
import { rangeStart } from "./date-range";
import type { ActivitySourceData } from "./source";
import type { ActivityDay } from "./stats";

/** The trailing-year window [from, today] a source scans. */
export const trailingYearWindow = (
  today: string,
): { from: string; to: string } => ({
  from: rangeStart(today, "year"),
  to: today,
});

/**
 * Buckets epoch-ms timestamps into sparse, ascending daily counts within
 * [from, to] inclusive, using the home timezone to place each timestamp on
 * a calendar day. Timestamps outside the window are ignored.
 */
export const dailyCountsFromTimestamps = (
  timestampsMs: Iterable<number>,
  timeZone: string,
  from: string,
  to: string,
): ActivityDay[] => {
  const counts = new Map<string, number>();
  for (const ms of timestampsMs) {
    const date = dateStringInZone(ms, timeZone);
    if (date >= from && date <= to) {
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
};

export const totalOf = (days: readonly ActivityDay[]): number =>
  days.reduce((sum, day) => sum + day.count, 0);

/**
 * Shared body for JSONL-log sources (Claude Code, Codex): read a local
 * newline-delimited JSON log, pull an epoch-ms timestamp from each record
 * via `extractMs`, and bucket into daily counts. A missing file returns
 * null; malformed lines and non-finite timestamps are skipped.
 */
export const jsonlDailyActivity = (
  path: string,
  extractMs: (record: Record<string, unknown>) => number,
  window: { readonly today: string; readonly homeTimezone: string },
): ActivitySourceData | null => {
  if (!existsSync(path)) {
    return null;
  }
  const timestamps: number[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    let record: unknown;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof record !== "object" || record === null) {
      continue;
    }
    const ms = extractMs(record as Record<string, unknown>);
    if (Number.isFinite(ms)) {
      timestamps.push(ms);
    }
  }
  const { from, to } = trailingYearWindow(window.today);
  const days = dailyCountsFromTimestamps(
    timestamps,
    window.homeTimezone,
    from,
    to,
  );
  return { accountLabel: null, total: totalOf(days), days };
};
