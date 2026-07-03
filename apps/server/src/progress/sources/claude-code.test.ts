import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActivitySourceContext } from "../source";
import { claudeCodeSource } from "./claude-code";

// Builds a context for the local Claude Code source. db/key/fetch/now are
// unused by this source, so they are harmless stubs.
const makeContext = (
  homeDir: string,
  today: string,
): ActivitySourceContext => ({
  db: undefined as unknown as ActivitySourceContext["db"],
  key: new Uint8Array(0),
  fetch: (() =>
    Promise.reject(new Error("no network"))) as ActivitySourceContext["fetch"],
  now: () => 0,
  today,
  homeTimezone: "UTC",
  homeDir,
});

const writeHistory = (homeDir: string, lines: readonly string[]): void => {
  const claudeDir = join(homeDir, ".claude");
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, "history.jsonl"), `${lines.join("\n")}\n`);
};

describe("claudeCodeSource", () => {
  test("buckets prompts per day, skipping out-of-window and malformed lines", async () => {
    const today = "2026-07-03";
    const homeDir = mkdtempSync(join(tmpdir(), "halero-cc-"));
    // Timestamps are milliseconds-since-epoch stored as strings.
    const firstJul2 = String(Date.UTC(2026, 6, 2, 10, 0, 0));
    const secondJul2 = String(Date.UTC(2026, 6, 2, 14, 30, 0));
    const jul3 = String(Date.UTC(2026, 6, 3, 9, 0, 0));
    const longAgo = String(Date.UTC(2024, 0, 1, 0, 0, 0));
    writeHistory(homeDir, [
      JSON.stringify({ timestamp: firstJul2, display: "one" }),
      JSON.stringify({ timestamp: secondJul2, display: "two" }),
      JSON.stringify({ timestamp: jul3, display: "three" }),
      JSON.stringify({ timestamp: longAgo, display: "old" }),
      "{ this is not valid json",
    ]);

    const data = await claudeCodeSource.readDaily(makeContext(homeDir, today));

    expect(data).not.toBeNull();
    expect(data?.accountLabel).toBeNull();
    expect(data?.days).toEqual([
      { date: "2026-07-02", count: 2 },
      { date: "2026-07-03", count: 1 },
    ]);
    expect(data?.total).toBe(3);
  });

  test("returns null when history.jsonl does not exist", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "halero-cc-empty-"));

    const data = await claudeCodeSource.readDaily(
      makeContext(homeDir, "2026-07-03"),
    );

    expect(data).toBeNull();
  });
});
