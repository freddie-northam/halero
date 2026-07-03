import { afterAll, afterEach, expect, test } from "bun:test";
import type { WebModule } from "@halero/module-sdk/web";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { act } from "react";
import type { GoogleStatus, HaleroApi, SearchResult } from "../lib/api";
import { ApiProvider } from "../lib/api-context";
import type { TrpcClient } from "../lib/trpc";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";

// The palette renders through Radix portals, and Radix freezes its SSR
// useLayoutEffect guard when its module first evaluates: with the usual
// beforeAll(registerHappyDom) the portal would never mount. So the DOM
// registers at module scope, after the React/testing imports above
// (hoisted static imports evaluate first, keeping react-dom on the same
// no-DOM load path as every other test file) and before the dynamic
// component imports below pull in Radix.
registerHappyDom();

// cmdk scrolls the selected row into view; happy-dom has no layout, so
// give it a no-op when the environment lacks one.
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => undefined;
}

const { HIGHLIGHT_END, HIGHLIGHT_START } = await import("../lib/highlight");
const { buildWebModules } = await import("../registry");
const { createAppRouter } = await import("../router");
const { SEARCH_DEBOUNCE_MS } = await import("./command-palette");

afterEach(cleanup);
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await unregisterHappyDom();
});

const HOME_TZ = "Europe/London";
const TODAY = "2025-07-02";

type CreateTaskStub = (input: {
  readonly title: string;
  readonly dueDate?: string;
}) => Promise<unknown>;

const createdTask = (title: string) => ({
  entityId: "t-new",
  title,
  status: "open",
  dueDate: null,
  notes: null,
  completedAt: null,
});

// The shell mounts the Today page on "/", so the wiring stubs the
// calendar and tasks procedures its sections reach (home-route test
// pattern). Quick-capture tests hand in their own create stub.
const buildStubClient = (createTask: CreateTaskStub): TrpcClient =>
  ({
    modules: {
      calendar: {
        today: {
          query: () => Promise.resolve({ homeTimezone: HOME_TZ, today: TODAY }),
        },
        range: {
          query: () => Promise.resolve({ homeTimezone: HOME_TZ, days: [] }),
        },
      },
      tasks: {
        list: { query: () => Promise.resolve({ tasks: [] }) },
        today: {
          query: () =>
            Promise.resolve({ homeTimezone: HOME_TZ, today: TODAY, tasks: [] }),
        },
        create: { mutate: createTask },
        toggle: { mutate: () => Promise.reject(new Error("not under test")) },
        delete: { mutate: () => Promise.reject(new Error("not under test")) },
      },
    },
  }) as unknown as TrpcClient;

const googleStatus: GoogleStatus = {
  clientConfigured: true,
  httpsOk: true,
  redirectUri: "https://halero.example.com/api/oauth/google/callback",
  connection: null,
};

const stubApi = (overrides: Partial<HaleroApi> = {}): HaleroApi => ({
  systemStatus: () =>
    Promise.resolve({ needsSetup: false, authenticated: true }),
  setup: () => Promise.resolve(),
  login: () => Promise.resolve(),
  logout: () => Promise.resolve(),
  googleStatus: () => Promise.resolve(googleStatus),
  saveGoogleClient: () => Promise.resolve(),
  syncGoogleNow: () =>
    Promise.resolve({ status: "success", upserts: 0, deletes: 0, error: null }),
  notificationSettings: () => Promise.resolve({ url: null }),
  saveNotifyUrl: () => Promise.resolve(),
  sendTestNotification: () => Promise.resolve({ delivered: true }),
  baseUrl: () => Promise.resolve({ url: "http://localhost:4253/" }),
  saveBaseUrl: () => Promise.resolve(),
  listApiTokens: () => Promise.resolve([]),
  createApiToken: (name: string) =>
    Promise.resolve({ id: "tok-1", name, token: `halero_${"a".repeat(64)}` }),
  revokeApiToken: () => Promise.resolve(),
  search: () => Promise.resolve([]),
  ...overrides,
});

const eventHit = (overrides: Partial<SearchResult> = {}): SearchResult => ({
  entityId: "ev-1",
  kind: "calendar.event",
  title: "Budget review",
  titleHighlighted: `${HIGHLIGHT_START}Budget${HIGHLIGHT_END} review`,
  snippetHighlighted: null,
  occurredStart: null,
  occurredDate: "2025-07-10",
  ...overrides,
});

interface RenderAppOptions {
  /** Backs the tasks create procedure for quick-capture tests. */
  readonly createTask?: CreateTaskStub;
  /** Extra modules appended after the shipped ones (probe commands). */
  readonly extraModules?: readonly WebModule[];
}

/** Renders the whole app so the palette runs on its real boot wiring. */
const renderApp = async (
  results: readonly SearchResult[] | (() => Promise<readonly SearchResult[]>),
  options: RenderAppOptions = {},
) => {
  const calls: string[] = [];
  const api = stubApi({
    search: (query) => {
      calls.push(query);
      return typeof results === "function"
        ? results()
        : Promise.resolve(results);
    },
  });
  const stubClient = buildStubClient(
    options.createTask ?? (() => Promise.reject(new Error("not under test"))),
  );
  const queryClient = new QueryClient();
  const router = createAppRouter(
    api,
    [
      ...buildWebModules(stubClient, api, queryClient),
      ...(options.extraModules ?? []),
    ],
    createMemoryHistory({ initialEntries: ["/"] }),
  );
  await router.load();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        <RouterProvider router={router} />
      </ApiProvider>
    </QueryClientProvider>,
  );
  await view.findByText(/Good (morning|afternoon|evening)/);
  return { view, router, calls };
};

const PLACEHOLDER = "Search Halero...";

/**
 * Types like a keystroke does: the value change plus the trailing
 * keyup. The keyup also flushes React's event replay queue, which
 * under happy-dom defers portal-targeted synthetic events until the
 * next native event arrives.
 */
const typeQuery = (input: Element, value: string): void => {
  fireEvent.change(input, { target: { value } });
  fireEvent.keyUp(input, { key: value.slice(-1) });
};

/**
 * Full Enter keystroke; the keyup flushes the replay queue (above).
 * Async act keeps the router's post-selection updates wrapped.
 */
const pressEnter = (input: Element): Promise<void> =>
  act(async () => {
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyUp(input, { key: "Enter" });
  });

/** Waits out the debounce inside act so timer updates stay wrapped. */
const settleDebounce = () =>
  act(
    () =>
      new Promise<void>((resolve) =>
        setTimeout(resolve, SEARCH_DEBOUNCE_MS + 50),
      ),
  );

test("Cmd+K opens the palette and Escape closes it", async () => {
  const { view } = await renderApp([]);

  expect(view.queryByPlaceholderText(PLACEHOLDER)).toBeNull();
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  const input = await view.findByPlaceholderText(PLACEHOLDER);
  expect(view.getByText("Type to search")).toBeTruthy();

  fireEvent.keyDown(input, { key: "Escape" });
  await waitFor(() =>
    expect(view.queryByPlaceholderText(PLACEHOLDER)).toBeNull(),
  );
});

test("the header trigger opens the palette and carries the aria-label", async () => {
  const { view } = await renderApp([]);

  const trigger = view.getByRole("button", { name: "Search Halero" });
  expect(trigger.getAttribute("aria-label")).toBe("Search Halero");
  fireEvent.click(trigger);

  expect(await view.findByPlaceholderText(PLACEHOLDER)).toBeTruthy();
});

test("rapid keystrokes dispatch exactly one debounced search", async () => {
  const { view, calls } = await renderApp([eventHit()]);
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  const input = await view.findByPlaceholderText(PLACEHOLDER);

  typeQuery(input, "b");
  typeQuery(input, "budg");
  typeQuery(input, "budget");
  await view.findByText("Event");

  expect(calls).toEqual(["budget"]);
});

test("results group under registry labels with marked fragments and the date", async () => {
  const { view } = await renderApp([
    eventHit({
      snippetHighlighted: `the ${HIGHLIGHT_START}budget${HIGHLIGHT_END} deck`,
    }),
  ]);
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  const input = await view.findByPlaceholderText(PLACEHOLDER);
  typeQuery(input, "budget");

  // The group heading comes from the calendar module's entity link.
  await view.findByText("Event");
  const marks = [...view.baseElement.querySelectorAll("mark")];
  expect(marks.map((mark) => mark.textContent)).toEqual(["Budget", "budget"]);
  expect(view.getByText("2025-07-10")).toBeTruthy();
});

test("a poisoned title cannot fabricate a highlight region", async () => {
  // Stored content with raw marker bytes: a stray start marker tries
  // to pass attacker text ("pwn") off as a match.
  const { view } = await renderApp([
    eventHit({
      titleHighlighted: `evil${HIGHLIGHT_START}pwn ${HIGHLIGHT_START}budget${HIGHLIGHT_END}`,
    }),
  ]);
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  const input = await view.findByPlaceholderText(PLACEHOLDER);
  typeQuery(input, "budget");

  await view.findByText("Event");
  const marks = [...view.baseElement.querySelectorAll("mark")];
  expect(marks.map((mark) => mark.textContent)).toEqual(["budget"]);
  // The stray marker is stripped, not rendered and not interpreted.
  expect(view.getByText(/evilpwn/)).toBeTruthy();
  expect(view.baseElement.textContent).not.toContain(HIGHLIGHT_START);
  expect(view.baseElement.textContent).not.toContain(HIGHLIGHT_END);
});

test("Enter on a calendar hit navigates to its agenda day and closes", async () => {
  const { view, router } = await renderApp([eventHit()]);
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  const input = await view.findByPlaceholderText(PLACEHOLDER);
  typeQuery(input, "budget");
  await view.findByText("Event");

  await pressEnter(input);

  await waitFor(() => {
    expect(router.state.location.pathname).toBe("/calendar");
  });
  expect(router.state.location.search).toEqual({
    view: "agenda",
    date: "2025-07-10",
  });
  await waitFor(() =>
    expect(view.queryByPlaceholderText(PLACEHOLDER)).toBeNull(),
  );
});

test("a kind without a registered link renders non-interactive", async () => {
  const { view, router } = await renderApp([
    eventHit({
      entityId: "note-1",
      kind: "note",
      titleHighlighted: "Grocery list",
      occurredDate: null,
    }),
  ]);
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  const input = await view.findByPlaceholderText(PLACEHOLDER);
  typeQuery(input, "grocery");

  const title = await view.findByText("Grocery list");
  const row = title.closest("[cmdk-item]");
  expect(row?.getAttribute("aria-disabled")).toBe("true");

  // Enter cannot select the disabled hit; it falls through to the
  // quick-capture command row, so the hit never navigates anywhere.
  await pressEnter(input);
  await settleDebounce();
  expect(router.state.location.pathname).toBe("/");
  expect(view.getByPlaceholderText(PLACEHOLDER)).toBeTruthy();
});

test("an empty or whitespace query never hits the server", async () => {
  const { view, calls } = await renderApp([]);
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  const input = await view.findByPlaceholderText(PLACEHOLDER);

  expect(view.getByText("Type to search")).toBeTruthy();
  typeQuery(input, "   ");
  await settleDebounce();

  expect(view.getByText("Type to search")).toBeTruthy();
  expect(calls).toEqual([]);
});

test("a failing search shows the readable error line", async () => {
  const { view } = await renderApp(() =>
    Promise.reject(new Error("You need to sign in before doing that.")),
  );
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  const input = await view.findByPlaceholderText(PLACEHOLDER);
  typeQuery(input, "budget");

  expect(
    await view.findByText("You need to sign in before doing that."),
  ).toBeTruthy();
});

test("a search with no hits shows the no-matches line", async () => {
  const { view } = await renderApp([]);
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  const input = await view.findByPlaceholderText(PLACEHOLDER);
  typeQuery(input, "nothing");

  expect(await view.findByText("No matches.")).toBeTruthy();
});

test("the idle palette offers quick capture alongside the hint", async () => {
  const { view } = await renderApp([]);
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  await view.findByPlaceholderText(PLACEHOLDER);

  expect(await view.findByText("New task...")).toBeTruthy();
  expect(view.getByText("Commands")).toBeTruthy();
  expect(view.getByText("Type to search")).toBeTruthy();
  // Only the tasks module contributes a command: exactly one row, so
  // today and calendar (command-less modules) contribute nothing.
  expect(view.baseElement.querySelectorAll("[cmdk-item]").length).toBe(1);
});

test("typing relabels quick capture with the trimmed pending title", async () => {
  const { view } = await renderApp([]);
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  const input = await view.findByPlaceholderText(PLACEHOLDER);
  typeQuery(input, "  buy milk ");

  expect(await view.findByText("New task: buy milk")).toBeTruthy();
  expect(view.queryByText("New task...")).toBeNull();
});

test("Enter on quick capture creates the task, closes, and lands on /tasks", async () => {
  const created: Array<{ title: string; dueDate?: string }> = [];
  const { view, router } = await renderApp([], {
    createTask: (input) => {
      created.push(input);
      return Promise.resolve(createdTask(input.title));
    },
  });
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  const input = await view.findByPlaceholderText(PLACEHOLDER);
  typeQuery(input, "  buy milk ");
  await view.findByText("New task: buy milk");

  await pressEnter(input);

  await waitFor(() => {
    expect(router.state.location.pathname).toBe("/tasks");
  });
  // The contribution trimmed the palette's raw input before creating.
  expect(created).toEqual([{ title: "buy milk" }]);
  await waitFor(() =>
    expect(view.queryByPlaceholderText(PLACEHOLDER)).toBeNull(),
  );
});

test("a command receives the palette's raw input untrimmed", async () => {
  const received: string[] = [];
  const probe: WebModule = {
    id: "probe",
    commands: [
      {
        id: "probe.echo",
        describe: () => "Echo input",
        run: (input) => {
          received.push(input);
          return Promise.resolve({ message: "Echoed." });
        },
      },
    ],
  };
  const { view, router } = await renderApp([], { extraModules: [probe] });
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  const input = await view.findByPlaceholderText(PLACEHOLDER);
  typeQuery(input, "  keep spaces  ");
  await view.findByText("Echo input");
  // Settle the debounced search inside act before driving selection.
  await settleDebounce();

  // Quick capture sits first; ArrowDown moves onto the probe row.
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyUp(input, { key: "ArrowDown" });
  await pressEnter(input);

  await waitFor(() => expect(received).toEqual(["  keep spaces  "]));
  // Success without navigateTo: the palette closes and stays put.
  await waitFor(() =>
    expect(view.queryByPlaceholderText(PLACEHOLDER)).toBeNull(),
  );
  expect(router.state.location.pathname).toBe("/");
});

test("a hanging command shows the pending row and keeps the palette open", async () => {
  const { view } = await renderApp([], {
    // Never settles: the palette must sit in the pending state.
    createTask: () => new Promise(() => undefined),
  });
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  const input = await view.findByPlaceholderText(PLACEHOLDER);
  typeQuery(input, "slow task");
  await view.findByText("New task: slow task");
  // Let the debounced search settle so the hanging create is the only
  // thing outstanding once Enter runs the command.
  await settleDebounce();

  await pressEnter(input);

  expect(await view.findByLabelText("Running...")).toBeTruthy();
  await settleDebounce();
  // Still pending after time passes: open, spinner up, input intact.
  expect(view.getByLabelText("Running...")).toBeTruthy();
  expect(view.getByPlaceholderText(PLACEHOLDER)).toBeTruthy();
  expect((input as HTMLInputElement).value).toBe("slow task");
});

test("a rejected command keeps the palette open with the error and input", async () => {
  const created: string[] = [];
  const { view, router } = await renderApp([], {
    createTask: (input) => {
      created.push(input.title);
      return Promise.resolve(createdTask(input.title));
    },
  });
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  const input = await view.findByPlaceholderText(PLACEHOLDER);

  // Whitespace-only input is still idle; quick capture reads bare.
  typeQuery(input, "   ");
  await view.findByText("New task...");
  // Settle the (never-dispatched) debounce inside act before Enter.
  await settleDebounce();
  await pressEnter(input);

  expect(await view.findByText("A task needs a title.")).toBeTruthy();
  expect(view.getByPlaceholderText(PLACEHOLDER)).toBeTruthy();
  expect((input as HTMLInputElement).value).toBe("   ");
  expect(created).toEqual([]);
  expect(router.state.location.pathname).toBe("/");

  // The preserved input lets the user fix the title and retry.
  typeQuery(input, "  buy milk ");
  await view.findByText("New task: buy milk");
  await pressEnter(input);

  await waitFor(() => {
    expect(router.state.location.pathname).toBe("/tasks");
  });
  expect(created).toEqual(["buy milk"]);
});
