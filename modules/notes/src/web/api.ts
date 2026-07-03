// What the notes web surfaces need from the host: the module's own tRPC
// procedures, wired up by the app registry. Mirrors TasksApi.

import type { Note, NoteDocument, NoteList } from "../contract";

export interface NoteUpdateInput {
  readonly entityId: string;
  readonly title?: string;
  readonly document?: NoteDocument;
  readonly tags?: readonly string[];
}

export interface NotesApi {
  readonly list: () => Promise<NoteList>;
  readonly get: (entityId: string) => Promise<Note>;
  readonly create: (input: {
    readonly title: string;
    readonly document?: NoteDocument;
  }) => Promise<Note>;
  readonly update: (input: NoteUpdateInput) => Promise<Note>;
  readonly delete: (entityId: string) => Promise<{ entityId: string }>;
}
