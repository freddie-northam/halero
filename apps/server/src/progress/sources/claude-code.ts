// Claude Code activity source: prompts per day, read from the local
// `~/.claude/history.jsonl` log. Purely local (no network, no stored token),
// yet it conforms to the same ActivitySource contract as the remote sources.
// Each line is one prompt; `timestamp` is milliseconds-since-epoch stored as
// a string, e.g. "1769473392758".

import { join } from "node:path";
import { jsonlDailyActivity } from "../local-activity";
import type { ActivitySource } from "../source";

export const CLAUDE_CODE_SOURCE_ID = "claude-code";

export const claudeCodeSource: ActivitySource = {
  id: CLAUDE_CODE_SOURCE_ID,
  readDaily: (ctx) =>
    Promise.resolve(
      jsonlDailyActivity(
        join(ctx.homeDir, ".claude", "history.jsonl"),
        (record) => Number(record.timestamp),
        ctx,
      ),
    ),
};
