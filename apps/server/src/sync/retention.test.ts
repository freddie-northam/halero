import { describe, expect, test } from "bun:test";
import { syncRuns } from "@halero/db";
import { eq } from "drizzle-orm";
import { makeTestApp, type TestApp } from "../test-utils";
import { pruneSyncRuns } from "./retention";

const CONNECTION_ID = "conn-1";

interface SeedRun {
  readonly id: string;
  readonly startedAt: number;
  readonly status: "success" | "failed";
  readonly connectionId?: string;
}

const seedRuns = (testApp: TestApp, runs: readonly SeedRun[]): void => {
  for (const run of runs) {
    testApp.database.db
      .insert(syncRuns)
      .values({
        id: run.id,
        connectionId: run.connectionId ?? CONNECTION_ID,
        startedAt: run.startedAt,
        finishedAt: run.startedAt + 1_000,
        status: run.status,
      })
      .run();
  }
};

const remainingIds = (testApp: TestApp, connectionId = CONNECTION_ID) =>
  testApp.database.db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(eq(syncRuns.connectionId, connectionId))
    .all()
    .map((row) => row.id)
    .sort();

/** run-01 (oldest) .. run-NN (newest); ids sort with their age. */
const makeRuns = (
  count: number,
  statusOf: (index: number) => "success" | "failed",
): SeedRun[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `run-${String(i + 1).padStart(2, "0")}`,
    startedAt: 1_000 + (i + 1) * 10,
    status: statusOf(i + 1),
  }));

describe("pruneSyncRuns", () => {
  test("keeps only the newest 20 runs", () => {
    const testApp = makeTestApp();
    seedRuns(
      testApp,
      makeRuns(25, () => "success"),
    );

    pruneSyncRuns(testApp.database.db, CONNECTION_ID);

    const ids = remainingIds(testApp);
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe("run-06");
    expect(ids[19]).toBe("run-25");
  });

  test("additionally keeps the most recent failed run when it would be pruned", () => {
    const testApp = makeTestApp();
    // run-02 and run-03 failed long ago; only the most recent of the two
    // failures survives alongside the newest 20.
    seedRuns(
      testApp,
      makeRuns(25, (n) => (n === 2 || n === 3 ? "failed" : "success")),
    );

    pruneSyncRuns(testApp.database.db, CONNECTION_ID);

    const ids = remainingIds(testApp);
    expect(ids).toHaveLength(21);
    expect(ids).toContain("run-03");
    expect(ids).not.toContain("run-02");
  });

  test("keeps no extra row when the most recent failure is already retained", () => {
    const testApp = makeTestApp();
    seedRuns(
      testApp,
      makeRuns(25, (n) => (n === 24 ? "failed" : "success")),
    );

    pruneSyncRuns(testApp.database.db, CONNECTION_ID);

    const ids = remainingIds(testApp);
    expect(ids).toHaveLength(20);
    expect(ids).toContain("run-24");
  });

  test("never touches other connections' runs", () => {
    const testApp = makeTestApp();
    seedRuns(
      testApp,
      makeRuns(25, () => "success"),
    );
    seedRuns(testApp, [
      { id: "other-1", startedAt: 500, status: "failed", connectionId: "c2" },
    ]);

    pruneSyncRuns(testApp.database.db, CONNECTION_ID);

    expect(remainingIds(testApp, "c2")).toEqual(["other-1"]);
  });
});
