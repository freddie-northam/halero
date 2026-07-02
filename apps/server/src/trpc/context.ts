import type { HaleroDatabase } from "@halero/db";
import type { LoginRateLimiter, SessionRecord } from "../auth";
import type { HaleroConfig } from "../config";
import type { FetchLike } from "../google/common";

export interface TrpcContext {
  readonly db: HaleroDatabase["db"];
  readonly sqlite: HaleroDatabase["sqlite"];
  readonly config: HaleroConfig;
  readonly key: Uint8Array;
  readonly session: SessionRecord | null;
  readonly sessionToken: string | null;
  readonly now: () => number;
  readonly loginRateLimiter: LoginRateLimiter;
  readonly googleFetch: FetchLike;
  readonly setSessionCookie: (token: string) => void;
  readonly clearSessionCookie: () => void;
}
