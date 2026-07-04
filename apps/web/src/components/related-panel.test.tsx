import { afterAll, afterEach, expect, test } from "bun:test";
import type {
  EntityLink,
  EntityLinkContribution,
} from "@halero/module-sdk/web";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { act, type ReactElement } from "react";
import type {
  CreateEntityLinkInput,
  EntityLinkList,
  HaleroApi,
  SearchOptions,
  SearchResult,
} from "../lib/api";
import { ApiProvider } from "../lib/api-context";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";

registerHappyDom();
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => undefined;
}

const { RelatedPanel } = await import("./related-panel");

afterEach(cleanup);
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await unregisterHappyDom();
});

const ENTITY_KINDS = new Map<string, EntityLinkContribution>([
  [
    "task.item",
    { kind: "task.item", label: "Task", buildLink: () => ({ path: "/tasks" }) },
  ],
  [
    "note.doc",
    {
      kind: "note.doc",
      label: "Note",
      buildLink: (hit) => ({
        path: "/notes",
        search: { note: hit.entityId },
      }),
    },
  ],
]);

interface StubOptions {
  readonly links?: EntityLinkList;
  readonly searchResults?: readonly SearchResult[];
  readonly onCreate?: (input: CreateEntityLinkInput) => void;
  readonly onDelete?: (id: string) => void;
}

const emptyLinks: EntityLinkList = { links: [] };

const makeApi = (options: StubOptions): HaleroApi => {
  let current = options.links ?? emptyLinks;
  return {
    entityLinks: async () => current,
    createEntityLink: async (input: CreateEntityLinkInput) => {
      options.onCreate?.(input);
      current = {
        links: [
          ...current.links,
          {
            id: "new-link",
            kind: input.kind,
            label: "Related to",
            neighbor: {
              entityId: input.toId,
              kind: "note.doc",
              title: "A linked note",
              occurredDate: null,
            },
          },
        ],
      };
      return { id: "new-link" };
    },
    deleteEntityLink: async (id: string) => {
      options.onDelete?.(id);
      current = { links: current.links.filter((link) => link.id !== id) };
    },
    search: async (_query: string, _opts?: SearchOptions) =>
      options.searchResults ?? [],
  } as unknown as HaleroApi;
};

const renderPanel = (
  api: HaleroApi,
  onNavigate: (link: EntityLink) => void = () => undefined,
): void => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree: ReactElement = (
    <QueryClientProvider client={client}>
      <ApiProvider api={api}>
        <RelatedPanel
          entityId="entity-1"
          entityKinds={ENTITY_KINDS}
          onNavigate={onNavigate}
        />
      </ApiProvider>
    </QueryClientProvider>
  );
  act(() => {
    render(tree);
  });
};

test("shows an empty state when nothing is linked", async () => {
  renderPanel(makeApi({}));
  await waitFor(() => {
    expect(document.body.textContent).toContain("Nothing linked yet");
  });
});

test("lists linked neighbors with their kind label", async () => {
  const links: EntityLinkList = {
    links: [
      {
        id: "l1",
        kind: "relates_to",
        label: "Related to",
        neighbor: {
          entityId: "n1",
          kind: "note.doc",
          title: "Design doc",
          occurredDate: null,
        },
      },
    ],
  };
  renderPanel(makeApi({ links }));
  await waitFor(() => {
    expect(document.body.textContent).toContain("Design doc");
  });
  expect(document.body.textContent).toContain("Note");
});

test("navigates to a neighbor through its kind's buildLink", async () => {
  const navigated: { current: EntityLink | null } = { current: null };
  const links: EntityLinkList = {
    links: [
      {
        id: "l1",
        kind: "relates_to",
        label: "Related to",
        neighbor: {
          entityId: "n1",
          kind: "note.doc",
          title: "Design doc",
          occurredDate: null,
        },
      },
    ],
  };
  renderPanel(makeApi({ links }), (link) => {
    navigated.current = link;
  });
  const row = await waitFor(() => {
    const found = document.body.querySelector(
      '[data-testid="related-neighbor"]',
    );
    if (found === null) {
      throw new Error("neighbor row not rendered yet");
    }
    return found as HTMLElement;
  });
  act(() => {
    fireEvent.click(row);
  });
  expect(navigated.current).toEqual({ path: "/notes", search: { note: "n1" } });
});

test("relates a searched entity through createEntityLink", async () => {
  const created: CreateEntityLinkInput[] = [];
  const api = makeApi({
    searchResults: [
      {
        entityId: "n2",
        kind: "note.doc",
        title: "Meeting notes",
        titleHighlighted: "Meeting notes",
        snippetHighlighted: null,
        occurredStart: null,
        occurredDate: null,
      },
    ],
    onCreate: (input) => created.push(input),
  });
  renderPanel(api);

  const input = await waitFor(() => {
    const found = document.body.querySelector('[data-testid="related-search"]');
    if (found === null) {
      throw new Error("search input not rendered yet");
    }
    return found as HTMLInputElement;
  });
  const form = document.body.querySelector(
    '[data-testid="related-search-form"]',
  ) as HTMLFormElement;
  input.value = "meeting";
  await act(async () => {
    fireEvent.submit(form);
    await Promise.resolve();
  });
  const result = await waitFor(() => {
    const found = document.body.querySelector('[data-testid="related-result"]');
    if (found === null) {
      throw new Error("search result not rendered yet");
    }
    return found as HTMLElement;
  });
  await act(async () => {
    fireEvent.click(result);
  });

  expect(created).toEqual([
    { fromId: "entity-1", toId: "n2", kind: "relates_to" },
  ]);
  await waitFor(() => {
    expect(document.body.textContent).toContain("A linked note");
  });
});
