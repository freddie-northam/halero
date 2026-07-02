import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  type RenderResult,
  render,
} from "@testing-library/react";
import type { GoogleConnection, GoogleStatus, HaleroApi } from "../lib/api";
import { ApiProvider } from "../lib/api-context";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";
import { SettingsScreen } from "./settings";

beforeAll(() => {
  registerHappyDom();
});
afterEach(cleanup);
afterAll(async () => {
  // Let React's scheduler flush passive-effect callbacks queued by the last
  // unmount while the DOM globals still exist, then tear happy-dom down.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await unregisterHappyDom();
});

const googleStatus = (overrides: Partial<GoogleStatus> = {}): GoogleStatus => ({
  clientConfigured: false,
  httpsOk: true,
  redirectUri: "https://halero.example.com/api/oauth/google/callback",
  connection: null,
  ...overrides,
});

const stubApi = (overrides: Partial<HaleroApi> = {}): HaleroApi => ({
  systemStatus: () =>
    Promise.resolve({ needsSetup: false, authenticated: true }),
  setup: () => Promise.resolve(),
  login: () => Promise.resolve(),
  logout: () => Promise.resolve(),
  googleStatus: () => Promise.resolve(googleStatus()),
  saveGoogleClient: () => Promise.resolve(),
  syncGoogleNow: () =>
    Promise.resolve({ status: "success", upserts: 0, deletes: 0, error: null }),
  agenda: () => Promise.resolve({ homeTimezone: "Europe/London", days: [] }),
  ...overrides,
});

const activeConnection: GoogleConnection = {
  id: "conn-1",
  status: "active",
  email: "person@example.com",
  lastError: null,
  nextSyncAt: null,
  consecutiveFailures: 0,
  lastRun: null,
  lastSuccessAt: null,
};

const connectedApi = (overrides: Partial<HaleroApi> = {}): HaleroApi =>
  stubApi({
    googleStatus: () =>
      Promise.resolve(
        googleStatus({ clientConfigured: true, connection: activeConnection }),
      ),
    ...overrides,
  });

interface RenderOptions {
  readonly connected?: boolean;
  readonly errorCode?: string | null;
}

const renderSettings = (
  api: HaleroApi,
  options: RenderOptions = {},
): RenderResult =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider api={api}>
        <SettingsScreen
          connected={options.connected ?? false}
          errorCode={options.errorCode ?? null}
        />
      </ApiProvider>
    </QueryClientProvider>,
  );

test("shows the blocking HTTPS guidance when the base URL is plain http", async () => {
  const view = renderSettings(
    stubApi({
      googleStatus: () => Promise.resolve(googleStatus({ httpsOk: false })),
    }),
  );

  expect(
    await view.findByText("Google Calendar needs an HTTPS address"),
  ).toBeTruthy();
  expect(view.getByText(/Tailscale Serve/)).toBeTruthy();
  // The gate replaces the client form entirely.
  expect(view.queryByLabelText("Client ID")).toBeNull();
});

test("shows the guided stepper and client form when HTTPS is ok", async () => {
  const view = renderSettings(stubApi());

  expect(
    await view.findByText(/publishing status .*In production/),
  ).toBeTruthy();
  expect(view.getByText(/hasn't verified this app/)).toBeTruthy();
  expect(
    view.getByText("https://halero.example.com/api/oauth/google/callback"),
  ).toBeTruthy();
  expect(view.getByRole("button", { name: "Copy" })).toBeTruthy();
  expect(view.getByLabelText("Client ID")).toBeTruthy();
  const secret = view.getByLabelText("Client secret");
  expect(secret.getAttribute("type")).toBe("password");
});

test("shows the connect button once the client is configured", async () => {
  const view = renderSettings(
    stubApi({
      googleStatus: () =>
        Promise.resolve(googleStatus({ clientConfigured: true })),
    }),
  );

  const connect = await view.findByRole("link", {
    name: "Connect Google Calendar",
  });
  expect(connect.getAttribute("href")).toBe("/api/oauth/google/start");
});

test("shows the connection card with email, badge, and a live sync button", async () => {
  const view = renderSettings(connectedApi());

  expect(await view.findByText("person@example.com")).toBeTruthy();
  expect(view.getByText("Active")).toBeTruthy();
  const syncNow = view.getByRole("button", { name: "Sync now" });
  expect(syncNow.hasAttribute("disabled")).toBe(false);
});

test("runs a sync and shows the result summary", async () => {
  let statusCalls = 0;
  const view = renderSettings(
    connectedApi({
      googleStatus: () => {
        statusCalls += 1;
        return Promise.resolve(
          googleStatus({
            clientConfigured: true,
            connection: activeConnection,
          }),
        );
      },
      syncGoogleNow: () =>
        Promise.resolve({
          status: "success",
          upserts: 3,
          deletes: 1,
          error: null,
        }),
    }),
  );

  fireEvent.click(await view.findByRole("button", { name: "Sync now" }));

  expect(await view.findByText("Synced: 3 updated, 1 removed")).toBeTruthy();
  // The connection status is refetched so a reauth flip shows up.
  expect(statusCalls).toBeGreaterThan(1);
});

test("shows the run's readable error when a sync fails", async () => {
  const view = renderSettings(
    connectedApi({
      syncGoogleNow: () =>
        Promise.resolve({
          status: "failed",
          upserts: 0,
          deletes: 0,
          error: "Halero could not reach Google Calendar.",
        }),
    }),
  );

  fireEvent.click(await view.findByRole("button", { name: "Sync now" }));

  expect(
    await view.findByText("Halero could not reach Google Calendar."),
  ).toBeTruthy();
});

test("shows the readable rejection when syncing cannot start", async () => {
  const view = renderSettings(
    connectedApi({
      syncGoogleNow: () =>
        Promise.reject(
          new Error(
            "Google needs a fresh sign-in before syncing can continue.",
          ),
        ),
    }),
  );

  fireEvent.click(await view.findByRole("button", { name: "Sync now" }));

  expect(
    await view.findByText(
      "Google needs a fresh sign-in before syncing can continue.",
    ),
  ).toBeTruthy();
});

test("offers a reconnect link when Google requires a new sign-in", async () => {
  const view = renderSettings(
    stubApi({
      googleStatus: () =>
        Promise.resolve(
          googleStatus({
            clientConfigured: true,
            connection: {
              ...activeConnection,
              status: "reauth_required",
            },
          }),
        ),
    }),
  );

  expect(await view.findByText("Needs reconnect")).toBeTruthy();
  const reconnect = view.getByRole("link", { name: "Reconnect" });
  expect(reconnect.getAttribute("href")).toBe("/api/oauth/google/start");
});

test("shows last synced and next sync timing on the active card", async () => {
  const view = renderSettings(
    connectedApi({
      googleStatus: () =>
        Promise.resolve(
          googleStatus({
            clientConfigured: true,
            connection: {
              ...activeConnection,
              lastSuccessAt: Date.now() - 5 * 60_000,
              nextSyncAt: Date.now() + 4 * 60_000,
            },
          }),
        ),
    }),
  );

  expect(await view.findByText("Last synced 5 min ago")).toBeTruthy();
  expect(view.getByText("Next sync in ~4 min")).toBeTruthy();
});

test("shows the last error on the active card instead of the synced time", async () => {
  const view = renderSettings(
    connectedApi({
      googleStatus: () =>
        Promise.resolve(
          googleStatus({
            clientConfigured: true,
            connection: {
              ...activeConnection,
              lastError: "Halero could not reach Google Calendar.",
              lastSuccessAt: Date.now() - 5 * 60_000,
              nextSyncAt: Date.now() + 4 * 60_000,
            },
          }),
        ),
    }),
  );

  expect(
    await view.findByText("Halero could not reach Google Calendar."),
  ).toBeTruthy();
  expect(view.queryByText(/Last synced/)).toBeNull();
  expect(view.getByText("Next sync in ~4 min")).toBeTruthy();
});

test("shows a not-synced-yet note before the first successful run", async () => {
  const view = renderSettings(connectedApi());

  expect(await view.findByText("Not synced yet")).toBeTruthy();
  // No schedule is known, so no next-sync estimate is shown.
  expect(view.queryByText(/Next sync/)).toBeNull();
});

test("turns the connected query param into a success banner", async () => {
  const view = renderSettings(stubApi(), { connected: true });

  // Wait for the status query to settle so no update races test teardown.
  await view.findByText(/Connect Google Calendar/);
  expect(view.getByText("Google Calendar is connected.")).toBeTruthy();
});

test("turns a callback error code into a readable banner", async () => {
  const view = renderSettings(stubApi(), { errorCode: "no_refresh_token" });

  await view.findByText(/Connect Google Calendar/);
  expect(view.getByText(/offline access/)).toBeTruthy();
});
