// The palette's quick-capture command: Cmd+K, type a title, Enter, a note
// is created and the editor opens on it. The host hands this command the
// registry-wrapped NotesApi, so a create invalidates the module's queries
// without this file ever touching query keys.

import type { CommandContribution } from "@halero/module-sdk/web";
import type { NotesApi } from "./api";

export const createNewNoteCommand = (api: NotesApi): CommandContribution => ({
  id: "notes.new",
  describe: (input) => {
    const title = input.trim();
    return title === "" ? "New note..." : `New note: ${title}`;
  },
  run: async (input) => {
    // The palette passes its raw input; trimming is this command's job. An
    // empty title is allowed here and defaulted, since a note is a canvas
    // the writer titles as they go, unlike a task's one-line capture.
    const title = input.trim() === "" ? "Untitled note" : input.trim();
    const note = await api.create({ title });
    // Land on the new note's editor so the writer starts typing at once.
    return {
      message: "Note created.",
      navigateTo: { path: `/notes/${note.entityId}` },
    };
  },
});
