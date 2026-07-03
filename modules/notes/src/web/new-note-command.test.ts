import { describe, expect, test } from "bun:test";
import type { Note } from "../contract";
import type { NotesApi } from "./api";
import { createNewNoteCommand } from "./new-note-command";

const note: Note = {
  entityId: "n-7",
  title: "Untitled note",
  document: [],
  tags: [],
  createdAt: 1,
  updatedAt: 1,
};

const makeStub = () => {
  const created: { title: string }[] = [];
  const api: NotesApi = {
    list: () => Promise.resolve({ notes: [] }),
    get: () => Promise.resolve(note),
    create: (input) => {
      created.push({ title: input.title });
      return Promise.resolve({ ...note, title: input.title });
    },
    update: () => Promise.resolve(note),
    delete: () => Promise.resolve({ entityId: "n-7" }),
  };
  return { api, created };
};

describe("createNewNoteCommand", () => {
  test("describes the empty and typed input states", () => {
    const { api } = makeStub();
    const command = createNewNoteCommand(api);

    expect(command.describe("")).toBe("New note...");
    expect(command.describe("  Trip  ")).toBe("New note: Trip");
  });

  test("creates a titled note and navigates to its editor", async () => {
    const { api, created } = makeStub();
    const command = createNewNoteCommand(api);

    const result = await command.run("Trip plan");

    expect(created).toEqual([{ title: "Trip plan" }]);
    expect(result.navigateTo).toEqual({ path: "/notes/n-7" });
  });

  test("defaults a blank input to an untitled note", async () => {
    const { api, created } = makeStub();
    const command = createNewNoteCommand(api);

    await command.run("   ");

    expect(created).toEqual([{ title: "Untitled note" }]);
  });
});
