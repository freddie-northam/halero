// The module's react-query keys and the invalidation wrapper the host
// registry applies to its NotesApi. The keys never leave this module: the
// host holds the QueryClient and calls the wrapper, so core code never
// learns (or hardcodes) module cache shapes.

import type { QueryClient } from "@tanstack/react-query";
import type { NotesApi } from "./api";

const notesRootKey = ["notes"] as const;

export const notesListKey = [...notesRootKey, "list"] as const;

export const noteDetailKey = (entityId: string) =>
  [...notesRootKey, "detail", entityId] as const;

/**
 * Wraps a NotesApi so mutations invalidate the right queries. The split
 * is deliberate and differs from the tasks module's blanket wrapper:
 *
 * - update() invalidates ONLY the list key, never a note's detail key.
 *   The open editor is uncontrolled after mount, so its autosave must not
 *   trigger a detail refetch (which would be wasted work and could race
 *   an in-flight save). The list still refreshes so a note's title and
 *   preview stay current behind the editor.
 * - create() and delete() invalidate the whole notes root: there is no
 *   open editor to protect, and a fresh or removed note must leave the
 *   list. The root key is a prefix of every detail key, so this also
 *   drops any stale cached detail.
 */
export const withNotesInvalidation = (
  api: NotesApi,
  queryClient: QueryClient,
): NotesApi => ({
  list: api.list,
  get: api.get,
  create: async (input) => {
    const note = await api.create(input);
    await queryClient.invalidateQueries({ queryKey: notesRootKey });
    return note;
  },
  update: async (input) => {
    const note = await api.update(input);
    await queryClient.invalidateQueries({ queryKey: notesListKey });
    return note;
  },
  delete: async (entityId) => {
    const result = await api.delete(entityId);
    await queryClient.invalidateQueries({ queryKey: notesRootKey });
    return result;
  },
});
