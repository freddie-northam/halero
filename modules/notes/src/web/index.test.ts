import { describe, expect, test } from "bun:test";
import { NOTE_ITEM_KIND } from "@halero/schemas";
import type { Note } from "../contract";
import type { NotesApi } from "./api";
import { createNotesWebModule } from "./index";

const note: Note = {
  entityId: "n-1",
  title: "Sample",
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

describe("the notes web module", () => {
  const module = createNotesWebModule(stubApi);

  test("contributes the Notes nav entry after Tasks", () => {
    expect(module.nav).toEqual([{ label: "Notes", path: "/notes", order: 40 }]);
  });

  test("contributes the list and editor pages", () => {
    expect(module.pages?.map((page) => page.path)).toEqual([
      "/notes",
      "/notes/$noteId",
    ]);
  });

  test("contributes the quick-capture palette command", () => {
    expect(module.commands?.map((command) => command.id)).toEqual([
      "notes.new",
    ]);
  });

  test("links note items to their own editor route under the Note heading", () => {
    const link = module.entityLinks?.[0];
    expect(link?.kind).toBe(NOTE_ITEM_KIND);
    expect(link?.label).toBe("Note");
    expect(link?.buildLink({ entityId: "n-42", occurredDate: null })).toEqual({
      path: "/notes/n-42",
    });
  });
});
