import type { EntryStatus } from "./resolve-entry-route";
import type { TrpcClient } from "./trpc";

export interface SetupInput {
  readonly password: string;
  readonly homeTimezone: string;
  readonly baseUrl?: string;
}

export interface GoogleConnection {
  readonly id: string;
  readonly status: string;
  readonly email: string | null;
  readonly lastError: string | null;
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

/**
 * The narrow surface of the server API that the UI consumes. Components
 * depend on this interface instead of the raw tRPC client so tests can
 * inject plain stubs through the provider, without module mocks.
 */
export interface HaleroApi {
  readonly systemStatus: () => Promise<EntryStatus>;
  readonly setup: (input: SetupInput) => Promise<void>;
  readonly login: (password: string) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly googleStatus: () => Promise<GoogleStatus>;
  readonly saveGoogleClient: (input: SaveGoogleClientInput) => Promise<void>;
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
});
