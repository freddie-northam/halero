import type { EntryStatus } from "./resolve-entry-route";
import type { TrpcClient } from "./trpc";

export interface SetupInput {
  readonly password: string;
  readonly homeTimezone: string;
  readonly baseUrl?: string;
}

export interface GoogleSyncRun {
  readonly startedAt: number;
  readonly finishedAt: number | null;
  readonly status: string;
  readonly upserts: number;
  readonly deletes: number;
  readonly error: string | null;
}

export interface GoogleConnection {
  readonly id: string;
  readonly status: string;
  readonly email: string | null;
  readonly lastError: string | null;
  /** Epoch ms of the next scheduled sync; null when unscheduled. */
  readonly nextSyncAt: number | null;
  readonly consecutiveFailures: number;
  readonly lastRun: GoogleSyncRun | null;
  /** Epoch ms when the most recent successful run finished. */
  readonly lastSuccessAt: number | null;
  /** The newest runs, newest first, for the Recent activity list. */
  readonly recentRuns: readonly GoogleSyncRun[];
}

export interface GoogleStatus {
  readonly clientConfigured: boolean;
  readonly httpsOk: boolean;
  readonly redirectUri: string;
  readonly connection: GoogleConnection | null;
}

export interface SaveGoogleClientInput {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface SyncNowResult {
  readonly status: "success" | "failed";
  readonly upserts: number;
  readonly deletes: number;
  readonly error: string | null;
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
  readonly googleStatus: () => Promise<GoogleStatus>;
  readonly saveGoogleClient: (input: SaveGoogleClientInput) => Promise<void>;
  readonly syncGoogleNow: () => Promise<SyncNowResult>;
  readonly notificationSettings: () => Promise<NotificationSettings>;
  /** An empty string turns notifications off. */
  readonly saveNotifyUrl: (url: string) => Promise<void>;
  readonly sendTestNotification: () => Promise<TestNotificationResult>;
  readonly baseUrl: () => Promise<BaseUrlSettings>;
  readonly saveBaseUrl: (url: string) => Promise<void>;
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
  googleStatus: () => client.connections.google.status.query(),
  saveGoogleClient: async (input) => {
    await client.connections.google.saveClient.mutate(input);
  },
  syncGoogleNow: () => client.connections.google.syncNow.mutate(),
  notificationSettings: () => client.notifications.settings.query(),
  saveNotifyUrl: async (url) => {
    await client.notifications.save.mutate({ url });
  },
  sendTestNotification: () => client.notifications.sendTest.mutate(),
  baseUrl: () => client.system.baseUrl.query(),
  saveBaseUrl: async (url) => {
    await client.system.setBaseUrl.mutate({ baseUrl: url });
  },
});
