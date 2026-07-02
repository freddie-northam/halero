// The connector protocol: the shapes a connector package exports and the
// context a host hands it. Extracted from the working Google Calendar
// connector, so every shape here is one a real sync has needed.

import type { z } from "zod";

/**
 * Bumped when the shapes below change incompatibly. A host refuses to
 * register a connector built against a different protocol version.
 */
export const PROTOCOL_VERSION = 1;

export type ConnectorCapability = "oauth2" | "apiKey" | "poll" | "webhook";

export interface ProducedKind {
  readonly kind: string;
  readonly schemaVersion: number;
}

export interface ConnectorManifest {
  /** Stable connector id, e.g. "google-calendar". */
  readonly id: string;
  /** The connector package's own semver. */
  readonly version: string;
  /** Must equal PROTOCOL_VERSION when the host registers the connector. */
  readonly protocolVersion: number;
  readonly capabilities: readonly ConnectorCapability[];
  readonly produces: readonly ProducedKind[];
}

/**
 * Declarative OAuth2 description; the HOST runs the flow. Params like
 * access_type=offline and prompt=consent live in extraAuthParams so the
 * host never hardcodes provider quirks.
 */
export interface OAuth2Spec {
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly scopes: readonly string[];
  readonly extraAuthParams?: Readonly<Record<string, string>>;
}

/** One independently cursored unit of sync, e.g. a single calendar. */
export interface StreamDef {
  readonly id: string;
  readonly displayName?: string;
}

/**
 * Spine fields of an upserted item. Absent fields are simply omitted;
 * the shape must survive a JSON round-trip unchanged, so undefined never
 * appears inside it and the host adds provenance (source) itself.
 */
export interface SyncOpSpine {
  readonly kind: string;
  readonly schemaVersion: number;
  readonly title?: string;
  readonly snippet?: string;
  readonly occurredStart?: number;
  readonly occurredEnd?: number;
}

export interface UpsertSyncOp {
  readonly op: "upsert";
  readonly externalId: string;
  /** Provider change marker (etag or similar) for change detection. */
  readonly version?: string;
  readonly spine: SyncOpSpine;
  /** Kind-specific fields the host's satellite writer stores. */
  readonly satellite?: Readonly<Record<string, unknown>>;
  /** The provider's raw item, for provenance. */
  readonly raw?: unknown;
}

export interface DeleteSyncOp {
  readonly op: "delete";
  readonly externalId: string;
}

/** Strictly JSON-serializable; enforced by the schemas in schemas.ts. */
export type SyncOp = UpsertSyncOp | DeleteSyncOp;

/** What a completed stream sync reports back to the host. */
export interface SyncStreamResult {
  readonly nextCursor?: string;
}

/**
 * Thrown by a connector when the provider declares the cursor dead
 * (Google's HTTP 410). The host clears the cursor, replays the stream
 * from scratch, and sweeps items that vanished meanwhile.
 */
export class ResyncRequired extends Error {}

/** Narrow fetch signature so hosts and tests can inject fakes. */
export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

/** Decoded OIDC id_token payload; the host decodes, connectors pick. */
export type IdTokenClaims = Readonly<Record<string, unknown>>;

export interface ConnectorIdentity {
  /** Stable per-account key (e.g. the id_token sub) external refs hang off. */
  readonly accountKey: string;
  readonly displayEmail?: string;
}

/**
 * Everything a connector gets from the host. The fetch already injects
 * auth headers and handles retry-once-on-401; retry and backoff policy
 * stay host-side.
 */
export interface SyncContext<TConfig> {
  readonly config: TConfig;
  readonly fetch: FetchLike;
  readonly log: (message: string) => void;
  readonly now: () => number;
}

export interface Connector<TConfig> {
  readonly manifest: ConnectorManifest;
  /** apiKey auth is deferred; the capability enum reserves it. */
  readonly auth: OAuth2Spec;
  readonly configSchema: z.ZodType<TConfig>;
  /** Returns null when the claims carry no usable account identity. */
  identify(profile: IdTokenClaims): ConnectorIdentity | null;
  discoverStreams(ctx: SyncContext<TConfig>): Promise<StreamDef[]>;
  /**
   * Yields PAGES (arrays) of ops so the host can commit one transaction
   * per provider page, and returns the stream's next cursor only after
   * every page has been yielded.
   */
  sync(
    ctx: SyncContext<TConfig>,
    stream: StreamDef,
    cursor?: string,
  ): AsyncGenerator<SyncOp[], SyncStreamResult>;
}

/** Identity helper that pins the connector to the SDK's contract. */
export const defineConnector = <TConfig>(
  connector: Connector<TConfig>,
): Connector<TConfig> => connector;
