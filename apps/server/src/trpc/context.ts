import type { FetchLike } from "@halero/connector-sdk";
import type { HaleroDatabase } from "@halero/db";
import type { LoginRateLimiter, SessionRecord } from "../auth";
import type { HaleroConfig } from "../config";
import type { SyncRunner } from "../sync/runner";

export interface TrpcContext {
  readonly db: HaleroDatabase["db"];
  readonly sqlite: HaleroDatabase["sqlite"];
  readonly config: HaleroConfig;
  readonly key: Uint8Array;
  readonly session: SessionRecord | null;
  readonly sessionToken: string | null;
  readonly now: () => number;
  readonly loginRateLimiter: LoginRateLimiter;
  readonly outboundFetch: FetchLike;
  /** Shared with the scheduler: one run path, one in-flight guard. */
  readonly syncRunner: SyncRunner;
  readonly setSessionCookie: (token: string) => void;
  readonly clearSessionCookie: () => void;
}
