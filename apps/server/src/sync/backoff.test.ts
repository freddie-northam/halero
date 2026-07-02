import { describe, expect, test } from "bun:test";
import { scheduleAfterRun } from "./backoff";

const NOW = 1_700_000_000_000;
const INTERVAL_SEC = 300;

// random() = 0.5 lands exactly in the middle of the +/-10% jitter band,
// so the delay equals the unjittered base delay.
const midJitter = (): number => 0.5;

describe("scheduleAfterRun on success", () => {
  test("resets failures and schedules one interval from now", () => {
    const next = scheduleAfterRun({
      outcome: "success",
      now: NOW,
      intervalSec: INTERVAL_SEC,
      previousFailures: 4,
      random: midJitter,
    });

    expect(next.consecutiveFailures).toBe(0);
    expect(next.nextSyncAt).toBe(NOW + 300_000);
  });

  test("applies jitter within the +/-10% bounds", () => {
    const lowest = scheduleAfterRun({
      outcome: "success",
      now: NOW,
      intervalSec: INTERVAL_SEC,
      previousFailures: 0,
      random: () => 0,
    });
    const highest = scheduleAfterRun({
      outcome: "success",
      now: NOW,
      intervalSec: INTERVAL_SEC,
      previousFailures: 0,
      random: () => 0.99,
    });

    // random() = 0 is exactly -10%; random() = 0.99 sits just under +10%.
    expect(lowest.nextSyncAt).toBe(NOW + 270_000);
    expect(highest.nextSyncAt).toBeGreaterThan(NOW + 300_000);
    expect(highest.nextSyncAt).toBeLessThan(NOW + 330_000);
  });
});

describe("scheduleAfterRun on failure", () => {
  const failAfter = (previousFailures: number) =>
    scheduleAfterRun({
      outcome: "failed",
      now: NOW,
      intervalSec: INTERVAL_SEC,
      previousFailures,
      random: midJitter,
    });

  test("increments failures and doubles the delay each time", () => {
    expect(failAfter(0)).toEqual({
      consecutiveFailures: 1,
      nextSyncAt: NOW + 600_000,
    });
    expect(failAfter(1)).toEqual({
      consecutiveFailures: 2,
      nextSyncAt: NOW + 1_200_000,
    });
    expect(failAfter(2)).toEqual({
      consecutiveFailures: 3,
      nextSyncAt: NOW + 2_400_000,
    });
  });

  test("caps the delay at one hour before jitter", () => {
    // 300s * 2^4 = 4800s would exceed the cap.
    expect(failAfter(3).nextSyncAt).toBe(NOW + 3_600_000);
    expect(failAfter(20).nextSyncAt).toBe(NOW + 3_600_000);
  });

  test("keeps jittered delays within +/-10% of the capped base", () => {
    const lowest = scheduleAfterRun({
      outcome: "failed",
      now: NOW,
      intervalSec: INTERVAL_SEC,
      previousFailures: 10,
      random: () => 0,
    });
    const highest = scheduleAfterRun({
      outcome: "failed",
      now: NOW,
      intervalSec: INTERVAL_SEC,
      previousFailures: 10,
      random: () => 0.99,
    });

    expect(lowest.nextSyncAt).toBe(NOW + 3_240_000);
    expect(highest.nextSyncAt).toBeGreaterThan(NOW + 3_600_000);
    expect(highest.nextSyncAt).toBeLessThan(NOW + 3_960_000);
  });
});
