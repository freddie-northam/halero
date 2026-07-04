// The notes module's web entry: nav, the list and editor pages, the
// entity link, and the quick-capture command. The host registry supplies
// the NotesApi (backed by modules.notes.* on its tRPC client) already
// wrapped with the module's invalidation helper; everything else is
// self-contained module code composing @halero/ui. No @halero/db import
// belongs here, ever.

import { defineWebModule, type WebModule } from "@halero/module-sdk/web";
import { NOTE_ITEM_KIND } from "@halero/schemas";
import type { ReactNode } from "react";
import type { NotesApi } from "./api";
import { normalizeNotesSearch } from "./helpers/notes-search";
import { createNewNoteCommand } from "./new-note-command";
import { createNoteDetailScreen } from "./note-detail-screen";
import { createNotesScreen } from "./notes-screen";

export type { Note, NoteDocument, NoteList, NoteListItem } from "../contract";
export type { NotesApi, NoteUpdateInput } from "./api";
export { withNotesInvalidation } from "./queries";

export interface NotesWebModuleOptions {
  /** Host slot: renders a note's relationships on its editor page. */
  readonly renderRelated?: (entityId: string) => ReactNode;
}

export const createNotesWebModule = (
  api: NotesApi,
  options: NotesWebModuleOptions = {},
): WebModule =>
  defineWebModule({
    id: "notes",
    nav: [{ label: "Notes", path: "/notes", order: 40, icon: "notes" }],
    pages: [
      {
        path: "/notes",
        component: createNotesScreen(api),
        validateSearch: normalizeNotesSearch,
      },
      {
        path: "/notes/$noteId",
        component: createNoteDetailScreen(api, options.renderRelated),
      },
    ],
    entityLinks: [
      {
        kind: NOTE_ITEM_KIND,
        label: "Note",
        // Each note has its own editor route, so a search hit deep-links
        // straight into it.
        buildLink: (hit) => ({ path: `/notes/${hit.entityId}` }),
      },
    ],
    commands: [createNewNoteCommand(api)],
  });
