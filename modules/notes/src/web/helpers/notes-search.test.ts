import { describe, expect, test } from "bun:test";
import { filterNotes, normalizeNotesSearch } from "./notes-search";

describe("normalizeNotesSearch", () => {
  test("defaults a missing search to an empty query", () => {
    expect(normalizeNotesSearch(undefined)).toEqual({ q: "" });
    expect(normalizeNotesSearch(null)).toEqual({ q: "" });
    expect(normalizeNotesSearch({})).toEqual({ q: "" });
  });

  test("keeps a string query and drops a non-string one", () => {
    expect(normalizeNotesSearch({ q: "trip" })).toEqual({ q: "trip" });
    expect(normalizeNotesSearch({ q: 42 })).toEqual({ q: "" });
  });
});

describe("filterNotes", () => {
  const notes = [
    { title: "Trip plan", preview: "book flights" },
    { title: "Groceries", preview: "milk and eggs" },
    { title: "Ideas", preview: "a note about FLIGHTS home" },
  ];

  test("returns every note for a blank query", () => {
    expect(filterNotes(notes, "")).toEqual(notes);
    expect(filterNotes(notes, "   ")).toEqual(notes);
  });

  test("matches title or preview, case-insensitively", () => {
    const hits = filterNotes(notes, "flights");
    expect(hits.map((note) => note.title)).toEqual(["Trip plan", "Ideas"]);
  });

  test("returns an empty list when nothing matches", () => {
    expect(filterNotes(notes, "zzz")).toEqual([]);
  });
});
