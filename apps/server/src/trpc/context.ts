import type { FetchLike } from "@halero/connector-sdk";
import type { EntityStore } from "@halero/core";
import type { HaleroDatabase } from "@halero/db";
import type { AgentRunManager } from "../agents/agent-run";
import type { LoginRateLimiter } from "../auth";
import type { HaleroConfig } from "../config";
import type { Principal } from "../middleware/session";
import type { Notifier } from "../notifier";
import type { SyncRunner } from "../sync/runner";

export interface TrpcContext {
  readonly db: HaleroDatabase["db"];
  readonly sqlite: HaleroDatabase["sqlite"];
  /** Entity write path; serves the module SDK's UserEntityStore. */
  readonly entities: EntityStore;
  readonly config: HaleroConfig;
  readonly key: Uint8Array;
  readonly session: Principal | null;
  readonly now: () => number;
  readonly loginRateLimiter: LoginRateLimiter;
  readonly outboundFetch: FetchLike;
  /** Shared with the scheduler: one run path, one in-flight guard. */
  readonly syncRunner: SyncRunner;
  /** Sends failure/test notifications to the configured notify_url. */
  readonly notifier: Notifier;
  /** Agent-run registry; null unless agent orchestration is enabled. */
  readonly agents: AgentRunManager | null;
  readonly setSessionCookie: (token: string) => void;
  readonly clearSessionCookie: () => void;
}
