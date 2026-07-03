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
  notificationSettings: () => Promise.resolve({ url: null }),
  saveNotifyUrl: () => Promise.resolve(),
  sendTestNotification: () => Promise.resolve({ delivered: true }),
  baseUrl: () => Promise.resolve({ url: "https://halero.example.com/" }),
  saveBaseUrl: () => Promise.resolve(),
  search: () => Promise.resolve([]),
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
  recentRuns: [],
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

test("shows the recent activity list with counts, errors, and times", async () => {
  const now = Date.now();
  const view = renderSettings(
    connectedApi({
      googleStatus: () =>
        Promise.resolve(
          googleStatus({
            clientConfigured: true,
            connection: {
              ...activeConnection,
              recentRuns: [
                {
                  startedAt: now - 5 * 60_000,
                  finishedAt: now - 5 * 60_000 + 900,
                  status: "success",
                  upserts: 3,
                  deletes: 1,
                  error: null,
                },
                {
                  startedAt: now - 3 * 60 * 60_000,
                  finishedAt: now - 3 * 60 * 60_000 + 900,
                  status: "failed",
                  upserts: 0,
                  deletes: 0,
                  error: "Halero could not reach Google Calendar.",
                },
              ],
            },
          }),
        ),
    }),
  );

  expect(await view.findByText("Recent activity")).toBeTruthy();
  expect(view.getByText("5 min ago")).toBeTruthy();
  expect(view.getByText("3 updated, 1 removed")).toBeTruthy();
  expect(view.getByText("3 hr ago")).toBeTruthy();
  expect(view.getByText("Failed")).toBeTruthy();
  expect(
    view.getByText("Halero could not reach Google Calendar."),
  ).toBeTruthy();
});

test("hides the recent activity list before any runs exist", async () => {
  const view = renderSettings(connectedApi());

  await view.findByText("person@example.com");
  expect(view.queryByText("Recent activity")).toBeNull();
});

test("shows recent activity on an errored connection card too", async () => {
  const now = Date.now();
  const view = renderSettings(
    stubApi({
      googleStatus: () =>
        Promise.resolve(
          googleStatus({
            clientConfigured: true,
            connection: {
              ...activeConnection,
              status: "error",
              lastError:
                "The connector produced sync data Halero could not understand.",
              recentRuns: [
                {
                  startedAt: now - 2 * 60_000,
                  finishedAt: now - 2 * 60_000 + 500,
                  status: "failed",
                  upserts: 0,
                  deletes: 0,
                  error:
                    "The connector produced sync data Halero could not understand.",
                },
              ],
            },
          }),
        ),
    }),
  );

  expect(await view.findByText("Recent activity")).toBeTruthy();
  expect(view.getByText("2 min ago")).toBeTruthy();
});

test("loads the saved notification URL and mentions ntfy", async () => {
  const view = renderSettings(
    stubApi({
      notificationSettings: () =>
        Promise.resolve({ url: "https://ntfy.sh/halero" }),
    }),
  );

  const input = await view.findByLabelText("Notification URL");
  expect(input.getAttribute("value")).toBe("https://ntfy.sh/halero");
  expect(view.getByText(/ntfy/)).toBeTruthy();
});

test("saves the notification URL trimmed and confirms", async () => {
  const saved: string[] = [];
  const view = renderSettings(
    stubApi({
      saveNotifyUrl: (url) => {
        saved.push(url);
        return Promise.resolve();
      },
    }),
  );

  const input = await view.findByLabelText("Notification URL");
  fireEvent.change(input, {
    target: { value: "  https://ntfy.sh/halero  " },
  });
  fireEvent.click(view.getByRole("button", { name: "Save URL" }));

  expect(await view.findByText("Notification settings saved.")).toBeTruthy();
  expect(saved).toEqual(["https://ntfy.sh/halero"]);
});

test("disables the test button until a URL is saved", async () => {
  const view = renderSettings(stubApi());

  const button = await view.findByRole("button", {
    name: "Send test notification",
  });
  expect(button.hasAttribute("disabled")).toBe(true);
});

test("sends a test notification and reports delivery", async () => {
  const view = renderSettings(
    stubApi({
      notificationSettings: () =>
        Promise.resolve({ url: "https://ntfy.sh/halero" }),
      sendTestNotification: () => Promise.resolve({ delivered: true }),
    }),
  );

  const button = await view.findByRole("button", {
    name: "Send test notification",
  });
  expect(button.hasAttribute("disabled")).toBe(false);
  fireEvent.click(button);

  expect(await view.findByText("Test notification sent.")).toBeTruthy();
});

test("reports a test notification that could not be delivered", async () => {
  const view = renderSettings(
    stubApi({
      notificationSettings: () =>
        Promise.resolve({ url: "https://ntfy.sh/halero" }),
      sendTestNotification: () => Promise.resolve({ delivered: false }),
    }),
  );

  fireEvent.click(
    await view.findByRole("button", { name: "Send test notification" }),
  );

  expect(await view.findByText(/could not be delivered/)).toBeTruthy();
});

test("shows the server address with the redirect URI warning", async () => {
  const view = renderSettings(stubApi());

  const input = await view.findByLabelText("Server address");
  expect(input.getAttribute("value")).toBe("https://halero.example.com/");
  // The inline warning: changing the address changes the OAuth redirect
  // URI, which must be updated in Google Cloud before reconnecting.
  expect(view.getByText(/Google Cloud console/)).toBeTruthy();
});

test("saves the server address trimmed and confirms", async () => {
  const saved: string[] = [];
  const view = renderSettings(
    stubApi({
      saveBaseUrl: (url: string) => {
        saved.push(url);
        return Promise.resolve();
      },
    }),
  );

  const input = await view.findByLabelText("Server address");
  fireEvent.change(input, {
    target: { value: "  https://moved.example.com  " },
  });
  fireEvent.click(view.getByRole("button", { name: "Save address" }));

  expect(await view.findByText("Server address saved.")).toBeTruthy();
  expect(saved).toEqual(["https://moved.example.com"]);
});

test("shows the readable rejection when the server address is invalid", async () => {
  const view = renderSettings(
    stubApi({
      saveBaseUrl: () =>
        Promise.reject(
          new Error("Base URL must start with http:// or https://."),
        ),
    }),
  );

  fireEvent.click(await view.findByRole("button", { name: "Save address" }));

  expect(
    await view.findByText("Base URL must start with http:// or https://."),
  ).toBeTruthy();
});

test("plain buttons default to type=button so they never submit forms", async () => {
  const view = renderSettings(stubApi());

  const copy = await view.findByRole("button", { name: "Copy" });
  expect(copy.getAttribute("type")).toBe("button");
  // Forms still opt in explicitly.
  const save = view.getByRole("button", { name: "Save client" });
  expect(save.getAttribute("type")).toBe("submit");
});

test("busy spinners are hidden from assistive tech", async () => {
  const view = renderSettings(stubApi());

  // The initial status query is still pending, so the standalone
  // spinner is on screen; it carries no information a screen reader
  // could use, so it must be aria-hidden.
  const spinner = view.container.querySelector("svg.animate-spin");
  expect(spinner?.getAttribute("aria-hidden")).toBe("true");
  // Let the queries settle before teardown.
  await view.findByText(/Connect Google Calendar/);
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
