// The activity-source contract. Every Progress source (GitHub, Claude Code,
// Codex, Wispr Flow, ...) implements this one interface, so the router,
// store, stats, and the whole web layer stay source-agnostic: adding a
// source is one file plus one registry line. A source is "connected" when a
// connection row exists for its id; the router checks that and only then
// calls readDaily, so readDaily may assume it is connected.

import type { FetchLike } from "@halero/connector-sdk";
import type { HaleroDatabase } from "@halero/db";
import type { ActivityDay } from "./stats";

export interface ActivitySourceContext {
  readonly db: HaleroDatabase["db"];
  readonly key: Uint8Array;
  /** Outbound HTTP for remote sources; tests inject a fake. */
  readonly fetch: FetchLike;
  readonly now: () => number;
  /** Today in the home timezone, 'YYYY-MM-DD'. */
  readonly today: string;
  readonly homeTimezone: string;
  /** Home directory root for local-file sources; injectable in tests. */
  readonly homeDir: string;
}

export interface ActivitySourceData {
  /** A human label for the connected account, when the source has one. */
  readonly accountLabel: string | null;
  /** Total across the returned window (for the "N in the last year" line). */
  readonly total: number;
  /** Sparse daily counts within the trailing window; densified downstream. */
  readonly days: readonly ActivityDay[];
}

export interface ActivitySource {
  /** Matches the catalog id and the activity_daily `source` column. */
  readonly id: string;
  /**
   * Reads this source's daily counts for the trailing window ending today.
   * Returns null only when the source cannot produce data at all (e.g. a
   * local file that does not exist); throws readable errors on real
   * failures. The caller has already confirmed the source is connected.
   */
  readDaily(ctx: ActivitySourceContext): Promise<ActivitySourceData | null>;
}
