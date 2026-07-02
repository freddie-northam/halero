import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  type RenderResult,
  render,
} from "@testing-library/react";
import type { HaleroApi } from "../lib/api";
import { ApiProvider } from "../lib/api-context";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";
import { LoginScreen } from "./login";

beforeAll(() => {
  registerHappyDom();
});
afterEach(cleanup);
afterAll(async () => {
  await unregisterHappyDom();
});

const stubApi = (overrides: Partial<HaleroApi> = {}): HaleroApi => ({
  systemStatus: () =>
    Promise.resolve({ needsSetup: false, authenticated: false }),
  setup: () => Promise.resolve(),
  login: () => Promise.resolve(),
  logout: () => Promise.resolve(),
  ...overrides,
});

const renderLogin = (api: HaleroApi): RenderResult =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider api={api}>
        <LoginScreen onSuccess={() => undefined} />
      </ApiProvider>
    </QueryClientProvider>,
  );

test("renders the password field and the submit button", () => {
  const view = renderLogin(stubApi());
  expect(view.getByLabelText("Password")).toBeTruthy();
  expect(view.getByRole("button", { name: "Sign in" })).toBeTruthy();
});

test("shows the readable error inline when login fails", async () => {
  const view = renderLogin(
    stubApi({
      login: () =>
        Promise.reject(new Error("Incorrect password. Please try again.")),
    }),
  );
  fireEvent.change(view.getByLabelText("Password"), {
    target: { value: "wrong-password" },
  });
  fireEvent.click(view.getByRole("button", { name: "Sign in" }));
  expect(
    await view.findByText("Incorrect password. Please try again."),
  ).toBeTruthy();
});
