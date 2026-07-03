// The notes module's server entry: its manifest, the note.item kind
// contribution, and the notes router. The host wires all of it in through
// its module registry; nothing here imports host code.

import { defineServerModule } from "@halero/module-sdk/server";
import { NOTE_ITEM_KIND, noteSatelliteSchema } from "@halero/schemas";
import { NOTE_ITEM_SCHEMA_VERSION, notesRouter } from "./router";

export { NOTE_ITEM_SCHEMA_VERSION } from "./router";

export const notesServerModule = defineServerModule({
  id: "notes",
  version: "0.1.0",
  entityKinds: [
    {
      kind: NOTE_ITEM_KIND,
      schemaVersion: NOTE_ITEM_SCHEMA_VERSION,
      schema: noteSatelliteSchema,
      // No satelliteWriter: no connector produces note.item items.
    },
  ],
  router: notesRouter,
});

export type { Note, NoteList, NoteListItem } from "../contract";
