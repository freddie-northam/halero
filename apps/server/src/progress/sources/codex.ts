// Codex CLI activity source: the local prompt history the Codex CLI appends
// to `~/.codex/history.jsonl`. Local-file source, so it reads the log
// directly instead of making HTTP calls, but it conforms to the same
// ActivitySource contract as the remote sources. One JSONL line is one
// prompt; `ts` is seconds-since-epoch stored as a string, e.g. "1771446813".

import { join } from "node:path";
import { jsonlDailyActivity } from "../local-activity";
import type { ActivitySource } from "../source";

export const CODEX_SOURCE_ID = "codex";

export const codexSource: ActivitySource = {
  id: CODEX_SOURCE_ID,
  readDaily: (ctx) =>
    Promise.resolve(
      jsonlDailyActivity(
        join(ctx.homeDir, ".codex", "history.jsonl"),
        (record) => Number(record.ts) * 1000,
        ctx,
      ),
    ),
};
