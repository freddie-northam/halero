// Server-side OpenF1 access for the F1 module's fetch-on-view data
// (results, standings, entry lists, and the phase-2 race detail). The
// connector owns the durable session sync; this owns everything the module
// pulls lazily when a widget asks for it, then caches in the f1_* tables.
//
// OpenF1 enforces a hard 3 requests/second limit, so every call goes
// through a shared serialized throttle that spaces requests ~350ms apart.

export const OPENF1_API_BASE = "https://api.openf1.org/v1";

/** Injectable so tests never hit the network. Defaults to global fetch. */
export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

const MIN_REQUEST_GAP_MS = 350;

let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Serializes OpenF1 calls and spaces them so bursts stay under 3 req/s.
 * Each caller waits its turn behind the previous request's gap.
 */
const throttled = <T>(task: () => Promise<T>): Promise<T> => {
  const run = async (): Promise<T> => {
    const now = Date.now();
    const since = now - lastAt;
    if (since < MIN_REQUEST_GAP_MS) {
      await wait(MIN_REQUEST_GAP_MS - since);
    }
    lastAt = Date.now();
    return task();
  };
  const next = chain.then(run, run);
  // Keep the chain alive regardless of individual failures.
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
};

const UNREACHABLE_MESSAGE =
  "Halero could not reach the OpenF1 API. Check the server's internet " +
  "connection and try again.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * GETs an OpenF1 collection and returns its rows. OpenF1 answers an empty
 * query with `{ detail: "No results found." }` (an object) and a rate-limit
 * hit with `{ error: ... }`; both become an empty array here so a missing
 * dataset renders as "no data", never a crash.
 */
export const fetchRows = (
  fetchImpl: FetchLike,
  path: string,
): Promise<readonly Record<string, unknown>[]> =>
  throttled(async () => {
    const response = await fetchImpl(`${OPENF1_API_BASE}/${path}`).catch(
      () => null,
    );
    if (response === null) {
      throw new Error(UNREACHABLE_MESSAGE);
    }
    if (!response.ok) {
      return [];
    }
    const body = await response.json().catch(() => null);
    if (!Array.isArray(body)) {
      return [];
    }
    return body.filter(isRecord);
  });

/** Coerces an OpenF1 numeric field, tolerating string-encoded numbers. */
export const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const asString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

export const asBool = (value: unknown): boolean => value === true;

/** gap_to_leader is number | "+1 LAP" | null; keep it as display text. */
export const asGap = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `+${value.toFixed(3)}`;
  }
  return typeof value === "string" ? value : null;
};
