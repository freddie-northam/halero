import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FetchLike } from "@halero/connector-sdk";
import type { HaleroDatabase } from "@halero/db";
import type { ActivitySourceContext } from "../source";
import { codexSource } from "./codex";

const tempDirs: string[] = [];

const makeHomeDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "codex-source-"));
  tempDirs.push(dir);
  return dir;
};

const writeHistory = (homeDir: string, lines: readonly string[]): void => {
  const codexDir = join(homeDir, ".codex");
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(join(codexDir, "history.jsonl"), lines.join("\n"), "utf8");
};

const secondsAt = (
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
): string =>
  String(Math.floor(Date.UTC(year, monthIndex, day, hour, 0, 0) / 1000));

const makeContext = (homeDir: string): ActivitySourceContext => ({
  db: undefined as unknown as HaleroDatabase["db"],
  key: new Uint8Array(0),
  fetch: (() => Promise.reject(new Error("no network"))) as FetchLike,
  now: () => 0,
  today: "2026-07-03",
  homeTimezone: "UTC",
  homeDir,
});

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("codexSource.readDaily", () => {
  test("buckets prompts per day within the trailing year window", async () => {
    const homeDir = makeHomeDir();
    writeHistory(homeDir, [
      JSON.stringify({
        session_id: "a",
        ts: secondsAt(2026, 6, 2, 10),
        text: "one",
      }),
      JSON.stringify({
        session_id: "a",
        ts: secondsAt(2026, 6, 2, 14),
        text: "two",
      }),
      JSON.stringify({
        session_id: "b",
        ts: secondsAt(2026, 6, 3, 9),
        text: "three",
      }),
      // More than one year before today: excluded from the window.
      JSON.stringify({
        session_id: "c",
        ts: secondsAt(2025, 0, 1, 0),
        text: "old",
      }),
      // Malformed line: skipped.
      "{ not json",
    ]);

    const result = await codexSource.readDaily(makeContext(homeDir));

    expect(result).not.toBeNull();
    expect(result?.accountLabel).toBeNull();
    expect(result?.days).toEqual([
      { date: "2026-07-02", count: 2 },
      { date: "2026-07-03", count: 1 },
    ]);
    expect(result?.total).toBe(3);
  });

  test("returns null when the history file is missing", async () => {
    const homeDir = makeHomeDir();

    const result = await codexSource.readDaily(makeContext(homeDir));

    expect(result).toBeNull();
  });
});
