// Test harness for connector packages: drives a connector's discovery
// and sync against an injected fetch fixture, validating every yielded
// page against the protocol schema. Extracted from the shapes the
// original in-server Google Calendar tests used.

import { syncOpsPageSchema, syncStreamResultSchema } from "./schemas";
import type {
  Connector,
  FetchLike,
  StreamDef,
  SyncContext,
  SyncOp,
} from "./types";

export interface FixtureCall {
  readonly url: URL;
  readonly init: RequestInit | undefined;
}

export interface FixtureFetch {
  readonly calls: readonly FixtureCall[];
  readonly fetch: FetchLike;
}

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * Records every request and fails loudly on one the handler does not
 * recognize (handler returns null), so fixtures never silently 404.
 */
export const createFixtureFetch = (
  handler: (url: URL, init?: RequestInit) => Response | null,
): FixtureFetch => {
  const calls: FixtureCall[] = [];
  return {
    calls,
    fetch: (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      const response = handler(url, init);
      if (response === null) {
        return Promise.reject(
          new Error(`Unexpected request in fixture: ${url.toString()}`),
        );
      }
      return Promise.resolve(response);
    },
  };
};

export interface RunConnectorFixtureOptions<TConfig> {
  readonly connector: Connector<TConfig>;
  /** Raw config; validated through the connector's own configSchema. */
  readonly config: unknown;
  readonly fetch: FetchLike;
  /** Per-stream cursors from a previous run, keyed by stream id. */
  readonly cursors?: Readonly<Record<string, string>>;
  readonly now?: () => number;
  /** Skip discovery and sync exactly these streams. */
  readonly streams?: readonly StreamDef[];
}

export interface FixtureStreamRun {
  readonly stream: StreamDef;
  readonly pages: readonly (readonly SyncOp[])[];
  readonly nextCursor: string | undefined;
  /** The window a full replay declared it covered; see SyncStreamResult. */
  readonly replayWindowStart: number | undefined;
}

export interface FixtureRunResult {
  readonly streams: readonly FixtureStreamRun[];
  readonly logs: readonly string[];
}

const runStream = async <TConfig>(
  connector: Connector<TConfig>,
  ctx: SyncContext<TConfig>,
  stream: StreamDef,
  cursor: string | undefined,
): Promise<FixtureStreamRun> => {
  const pages: SyncOp[][] = [];
  const generator = connector.sync(ctx, stream, cursor);
  for (;;) {
    const step = await generator.next();
    if (step.done) {
      const result = syncStreamResultSchema.parse(step.value);
      return {
        stream,
        pages,
        nextCursor: result.nextCursor,
        replayWindowStart: result.replayWindowStart,
      };
    }
    pages.push(syncOpsPageSchema.parse(step.value));
  }
};

/**
 * Runs a connector end to end against an injected fetch: stream
 * discovery (or exactly the streams you pass), then a full sync of each
 * stream, validating every yielded page against the protocol schema.
 * Returns the applied pages, each stream's next cursor, and the
 * connector's log lines, ready for assertions. Pair it with
 * createFixtureFetch so unexpected requests fail loudly.
 */
export const runConnectorFixture = async <TConfig>(
  options: RunConnectorFixtureOptions<TConfig>,
): Promise<FixtureRunResult> => {
  const { connector } = options;
  const logs: string[] = [];
  const ctx: SyncContext<TConfig> = {
    config: connector.configSchema.parse(options.config),
    fetch: options.fetch,
    log: (message) => logs.push(message),
    now: options.now ?? (() => Date.now()),
  };
  const streams = options.streams ?? (await connector.discoverStreams(ctx));
  const runs: FixtureStreamRun[] = [];
  for (const stream of streams) {
    runs.push(
      await runStream(connector, ctx, stream, options.cursors?.[stream.id]),
    );
  }
  return { streams: runs, logs };
};
