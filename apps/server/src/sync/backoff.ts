// Pure scheduling arithmetic for the sync scheduler. Kept free of I/O so
// the growth curve, cap, and jitter bounds are directly testable.

/** Failed runs never push the next attempt more than an hour out. */
const FAILURE_DELAY_CAP_SEC = 3_600;

/** Every delay is jittered by +/-10% so retries never line up exactly. */
const JITTER_FRACTION = 0.1;

export interface ScheduleAfterRunInput {
  readonly outcome: "success" | "failed";
  /** Reschedules always start from now, never from the missed slot. */
  readonly now: number;
  readonly intervalSec: number;
  readonly previousFailures: number;
  /** Random source in [0, 1); injected so tests can pin the jitter. */
  readonly random: () => number;
}

export interface ScheduleAfterRunResult {
  readonly consecutiveFailures: number;
  readonly nextSyncAt: number;
}

const baseDelaySec = (
  input: ScheduleAfterRunInput,
  failures: number,
): number =>
  input.outcome === "success"
    ? input.intervalSec
    : Math.min(input.intervalSec * 2 ** failures, FAILURE_DELAY_CAP_SEC);

/**
 * Computes the connection's post-run scheduling state. Success resets the
 * failure count and schedules one interval out; a failure doubles the
 * delay per consecutive failure, capped at an hour, so a broken
 * connection cannot burn API quota. Jitter applies after the cap.
 */
export const scheduleAfterRun = (
  input: ScheduleAfterRunInput,
): ScheduleAfterRunResult => {
  const consecutiveFailures =
    input.outcome === "success" ? 0 : input.previousFailures + 1;
  const delayMs = baseDelaySec(input, consecutiveFailures) * 1_000;
  const jitterFactor = 1 + (input.random() * 2 - 1) * JITTER_FRACTION;
  return {
    consecutiveFailures,
    nextSyncAt: input.now + Math.round(delayMs * jitterFactor),
  };
};
