import type { EntryStatus } from "./resolve-entry-route";
import type { TrpcClient } from "./trpc";

// Connection + Progress shapes are inferred straight from the typed tRPC
// client so the web never re-declares (and never drifts from) them.
export type ConnectionCatalog = Awaited<
  ReturnType<TrpcClient["connections"]["catalog"]["query"]>
>;
export type ConnectionCatalogItem = ConnectionCatalog[number];
export type ConnectionDetail = Awaited<
  ReturnType<TrpcClient["connections"]["status"]["query"]>
>;
export type OauthClientConfig = Awaited<
  ReturnType<TrpcClient["connections"]["oauthConfig"]["query"]>
>;
export type SyncNowResult = Awaited<
  ReturnType<TrpcClient["connections"]["syncNow"]["mutate"]>
>;
export type ProgressStatus = Awaited<
  ReturnType<TrpcClient["progress"]["status"]["query"]>
>;
export type ProgressHeatmap = Awaited<
  ReturnType<TrpcClient["progress"]["heatmap"]["query"]>
>;
// Relationship-layer shapes inferred from the typed links router so the
// web never re-declares (and never drifts from) the edge model.
export type EntityLinkList = Awaited<
  ReturnType<TrpcClient["links"]["for"]["query"]>
>;
export type EntityLinkItem = EntityLinkList["links"][number];
export type EntityLinkNeighbor = EntityLinkItem["neighbor"];

export interface CreateEntityLinkInput {
  readonly fromId: string;
  readonly toId: string;
  readonly kind: string;
}

export interface SetupInput {
  readonly password: string;
  readonly name: string;
  readonly homeTimezone: string;
  readonly baseUrl?: string;
}

export interface SaveOauthClientInput {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface NotificationSettings {
  /** The saved notify URL, or null while notifications are off. */
  readonly url: string | null;
}

export interface TestNotificationResult {
  readonly delivered: boolean;
}

export interface BaseUrlSettings {
  /** The address this instance is currently reached at. */
  readonly url: string;
}

export interface ApiTokenSummary {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  /** Epoch ms of the last authenticated use; null when never used. */
  readonly lastUsedAt: number | null;
  /** Epoch ms of revocation; null while the token is live. */
  readonly revokedAt: number | null;
}

export interface CreatedApiToken {
  readonly id: string;
  readonly name: string;
  /** The plaintext token. Shown exactly once; never retrievable again. */
  readonly token: string;
}

export interface SearchResult {
  readonly entityId: string;
  readonly kind: string;
  readonly title: string | null;
  /** Server highlight() output; split on the marker chars to render. */
  readonly titleHighlighted: string;
  readonly snippetHighlighted: string | null;
  readonly occurredStart: number | null;
  /** Home-timezone date of the hit; the client does no timezone math. */
  readonly occurredDate: string | null;
}

export interface SearchOptions {
  readonly kind?: string;
  readonly limit?: number;
}

/**
 * The narrow surface of the CORE server API that the UI consumes.
 * Components depend on this interface instead of the raw tRPC client so
 * tests can inject plain stubs through the provider, without module
 * mocks. Module procedures (modules.<id>.*) are not part of it: the web
 * module registry wires each module's own narrow API straight from the
 * tRPC client.
 */
export interface HaleroApi {
  readonly systemStatus: () => Promise<EntryStatus>;
  readonly setup: (input: SetupInput) => Promise<void>;
  readonly login: (password: string) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly connectionsCatalog: () => Promise<ConnectionCatalog>;
  readonly connectionStatus: (connectorId: string) => Promise<ConnectionDetail>;
  readonly connectionOauthConfig: (
    connectorId: string,
  ) => Promise<OauthClientConfig>;
  readonly saveOauthClient: (
    connectorId: string,
    input: SaveOauthClientInput,
  ) => Promise<void>;
  readonly connectApiKey: (
    connectorId: string,
    token: string,
  ) => Promise<{ connected: true; accountLabel: string }>;
  readonly connectLocal: (connectorId: string) => Promise<void>;
  readonly disconnectConnection: (connectorId: string) => Promise<void>;
  readonly syncConnection: (connectorId: string) => Promise<SyncNowResult>;
  readonly notificationSettings: () => Promise<NotificationSettings>;
  /** An empty string turns notifications off. */
  readonly saveNotifyUrl: (url: string) => Promise<void>;
  readonly sendTestNotification: () => Promise<TestNotificationResult>;
  readonly baseUrl: () => Promise<BaseUrlSettings>;
  readonly saveBaseUrl: (url: string) => Promise<void>;
  readonly listApiTokens: () => Promise<readonly ApiTokenSummary[]>;
  readonly createApiToken: (name: string) => Promise<CreatedApiToken>;
  readonly revokeApiToken: (id: string) => Promise<void>;
  readonly search: (
    query: string,
    opts?: SearchOptions,
  ) => Promise<readonly SearchResult[]>;
  /** Every relationship touching an entity, with its neighbors resolved. */
  readonly entityLinks: (entityId: string) => Promise<EntityLinkList>;
  readonly createEntityLink: (
    input: CreateEntityLinkInput,
  ) => Promise<{ readonly id: string }>;
  readonly deleteEntityLink: (id: string) => Promise<void>;
}

export const createHaleroApi = (client: TrpcClient): HaleroApi => ({
  systemStatus: () => client.system.status.query(),
  setup: async (input) => {
    await client.system.setup.mutate(input);
  },
  login: async (password) => {
    await client.auth.login.mutate({ password });
  },
  logout: async () => {
    await client.auth.logout.mutate();
  },
  connectionsCatalog: () => client.connections.catalog.query(),
  connectionStatus: (connectorId) =>
    client.connections.status.query({ connectorId }),
  connectionOauthConfig: (connectorId) =>
    client.connections.oauthConfig.query({ connectorId }),
  saveOauthClient: async (connectorId, input) => {
    await client.connections.saveOauthClient.mutate({ connectorId, ...input });
  },
  connectApiKey: (connectorId, token) =>
    client.connections.connectApiKey.mutate({ connectorId, token }),
  connectLocal: async (connectorId) => {
    await client.connections.connectLocal.mutate({ connectorId });
  },
  disconnectConnection: async (connectorId) => {
    await client.connections.disconnect.mutate({ connectorId });
  },
  syncConnection: (connectorId) =>
    client.connections.syncNow.mutate({ connectorId }),
  notificationSettings: () => client.notifications.settings.query(),
  saveNotifyUrl: async (url) => {
    await client.notifications.save.mutate({ url });
  },
  sendTestNotification: () => client.notifications.sendTest.mutate(),
  baseUrl: () => client.system.baseUrl.query(),
  saveBaseUrl: async (url) => {
    await client.system.setBaseUrl.mutate({ baseUrl: url });
  },
  listApiTokens: () => client.tokens.list.query(),
  createApiToken: (name) => client.tokens.create.mutate({ name }),
  revokeApiToken: async (id) => {
    await client.tokens.revoke.mutate({ id });
  },
  search: async (query, opts) =>
    (await client.system.search.query({ query, ...opts })).results,
  entityLinks: (entityId) => client.links.for.query({ entityId }),
  createEntityLink: (input) => client.links.create.mutate(input),
  deleteEntityLink: async (id) => {
    await client.links.delete.mutate({ id });
  },
});
