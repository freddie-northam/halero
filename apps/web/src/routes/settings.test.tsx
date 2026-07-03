import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  type RenderResult,
  render,
  waitFor,
} from "@testing-library/react";
import type { ReactElement } from "react";
import type { ConnectionCatalogItem, HaleroApi } from "../lib/api";
import { ApiProvider } from "../lib/api-context";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";
import { IntegrationsSection } from "./settings-integrations";

beforeAll(() => {
  registerHappyDom();
});
afterEach(cleanup);
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await unregisterHappyDom();
});

const item = (
  overrides: Partial<ConnectionCatalogItem>,
): ConnectionCatalogItem =>
  ({
    id: "github",
    displayName: "GitHub",
    description: "Pull your contribution activity into the heatmap.",
    category: "developer",
    iconId: "github",
    authKind: "apiKey",
    consumer: "activity",
    availability: "available",
    implemented: true,
    featured: true,
    connection: null,
    ...overrides,
  }) as ConnectionCatalogItem;

const stubApi = (overrides: Partial<HaleroApi> = {}): HaleroApi =>
  ({
    connectionsCatalog: () => Promise.resolve([]),
    connectionOauthConfig: () =>
      Promise.resolve({
        clientConfigured: false,
        httpsOk: true,
        redirectUri: "",
      }),
    saveOauthClient: () => Promise.resolve(),
    connectApiKey: () =>
      Promise.resolve({ connected: true as const, accountLabel: "octocat" }),
    disconnectConnection: () => Promise.resolve(),
    ...overrides,
  }) as unknown as HaleroApi;

// Pre-seed the catalog into the cache so the section renders its data
// synchronously; the async fetch path is covered by the server tests.
const renderSection = async (
  api: HaleroApi,
  catalog: ConnectionCatalogItem[],
): Promise<RenderResult> => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["connections", "catalog"], catalog);
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <ApiProvider api={api}>
        <IntegrationsSection
          connected={false}
          errorCode={null}
          errorConnector={null}
        />
      </ApiProvider>
    </QueryClientProvider>
  );
  let view!: RenderResult;
  await act(async () => {
    view = render(ui);
  });
  return view;
};

test("lists live integrations and coming-soon cards", async () => {
  const view = await renderSection(stubApi(), [
    item({ id: "github", displayName: "GitHub" }),
    item({
      id: "slack",
      displayName: "Slack",
      authKind: "oauth2",
      consumer: null,
      availability: "coming_soon",
      implemented: false,
      featured: false,
    }),
  ]);
  expect(view.getByText("GitHub")).toBeTruthy();
  expect(view.getByText("Slack")).toBeTruthy();
  // "Coming soon" appears as both the section header and the card badge.
  expect(view.getAllByText("Coming soon").length).toBeGreaterThan(0);
});

test("opens the token dialog for an apiKey integration", async () => {
  // The connectApiKey mutation itself is covered by the server router test;
  // here we verify the Connect action opens the token entry dialog.
  const view = await renderSection(stubApi(), [item({})]);
  fireEvent.click(view.getByText("Connect"));
  expect(await view.findByLabelText("Access token")).toBeTruthy();
});

test("disconnects a connected integration", async () => {
  let disconnected: string | null = null;
  const api = stubApi({
    connectionsCatalog: () =>
      Promise.resolve([
        item({
          connection: {
            accountLabel: "octocat",
            status: "active",
            lastError: null,
            lastSyncedAt: null,
          },
        }),
      ]),
    disconnectConnection: (id) => {
      disconnected = id;
      return Promise.resolve();
    },
  });
  const view = await renderSection(api, [
    item({
      connection: {
        accountLabel: "octocat",
        status: "active",
        lastError: null,
        lastSyncedAt: null,
      },
    }),
  ]);
  fireEvent.click(view.getByText("Disconnect"));
  await waitFor(() => {
    expect(disconnected).toBe("github");
  });
});
