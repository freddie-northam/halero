// Wispr Flow activity source: dictations per day, read from the local
// SQLite database the Wispr Flow desktop app keeps under Application Support.
// Purely local (no network, no stored token), yet it conforms to the same
// ActivitySource contract as the remote sources. The daily metric is
// dictations per day: one `History` row is one dictation.

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  dailyCountsFromTimestamps,
  totalOf,
  trailingYearWindow,
} from "../local-activity";
import type {
  ActivitySource,
  ActivitySourceContext,
  ActivitySourceData,
} from "../source";

export const WISPR_FLOW_SOURCE_ID = "wispr-flow";

interface HistoryRow {
  readonly timestamp: string | null;
}

// Wispr Flow stores `timestamp` as TEXT like "2026-07-03 00:51:24.619 +00:00":
// date, space, time-with-millis, space, then a UTC offset. Converting it to an
// ISO string means replacing the first space with 'T' and dropping the space
// before the offset, e.g. "2026-07-03T00:51:24.619+00:00". Returns null when
// the value is missing or does not parse.
export const parseWisprTimestamp = (text: string | null): number | null => {
  if (text === null) {
    return null;
  }
  const iso = text.replace(" ", "T").replace(" ", "");
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return null;
  }
  return ms;
};

const readTimestampsMs = (path: string): number[] => {
  const db = new Database(path, { readonly: true });
  try {
    const rows = db
      .query("SELECT timestamp FROM History WHERE timestamp IS NOT NULL")
      .all() as HistoryRow[];
    const timestamps: number[] = [];
    for (const row of rows) {
      const ms = parseWisprTimestamp(row.timestamp);
      if (ms !== null) {
        timestamps.push(ms);
      }
    }
    return timestamps;
  } finally {
    db.close();
  }
};

export const wisprFlowSource: ActivitySource = {
  id: WISPR_FLOW_SOURCE_ID,
  async readDaily(
    ctx: ActivitySourceContext,
  ): Promise<ActivitySourceData | null> {
    const path = join(
      ctx.homeDir,
      "Library",
      "Application Support",
      "Wispr Flow",
      "flow.sqlite",
    );
    if (!existsSync(path)) {
      return null;
    }
    const timestamps = readTimestampsMs(path);
    const { from, to } = trailingYearWindow(ctx.today);
    const days = dailyCountsFromTimestamps(
      timestamps,
      ctx.homeTimezone,
      from,
      to,
    );
    return { accountLabel: null, total: totalOf(days), days };
  },
};
