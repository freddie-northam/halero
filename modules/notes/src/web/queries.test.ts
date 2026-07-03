import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type { Note } from "../contract";
import type { NotesApi } from "./api";
import { withNotesInvalidation } from "./queries";

const note: Note = {
  entityId: "n-1",
  title: "Buy milk",
  document: [],
  tags: [],
  createdAt: 1,
  updatedAt: 1,
};

const stubApi: NotesApi = {
  list: () => Promise.resolve({ notes: [] }),
  get: () => Promise.resolve(note),
  create: () => Promise.resolve(note),
  update: () => Promise.resolve(note),
  delete: () => Promise.resolve({ entityId: "n-1" }),
};

/** Captures the queryKey each invalidateQueries call targets. */
const makeSpyClient = () => {
  const queryClient = new QueryClient();
  const keys: unknown[] = [];
  queryClient.invalidateQueries = ((filters?: { queryKey?: unknown }) => {
    keys.push(filters?.queryKey);
    return Promise.resolve();
  }) as QueryClient["invalidateQueries"];
  return { queryClient, keys };
};

describe("withNotesInvalidation", () => {
  test("create invalidates the whole notes root", async () => {
    const { queryClient, keys } = makeSpyClient();
    const wrapped = withNotesInvalidation(stubApi, queryClient);

    await wrapped.create({ title: "New" });

    expect(keys).toEqual([["notes"]]);
  });

  test("delete invalidates the whole notes root", async () => {
    const { queryClient, keys } = makeSpyClient();
    const wrapped = withNotesInvalidation(stubApi, queryClient);

    await wrapped.delete("n-1");

    expect(keys).toEqual([["notes"]]);
  });

  test("update invalidates only the list, never a detail or the root", async () => {
    const { queryClient, keys } = makeSpyClient();
    const wrapped = withNotesInvalidation(stubApi, queryClient);

    await wrapped.update({ entityId: "n-1", title: "Edit" });

    // The list key, not the root: the open editor's detail query must not
    // be refetched by its own autosave.
    expect(keys).toEqual([["notes", "list"]]);
  });

  test("reads pass through without touching the cache", async () => {
    const { queryClient, keys } = makeSpyClient();
    const wrapped = withNotesInvalidation(stubApi, queryClient);

    await wrapped.list();
    await wrapped.get("n-1");

    expect(keys).toEqual([]);
  });
});
