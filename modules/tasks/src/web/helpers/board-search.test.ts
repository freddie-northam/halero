import { describe, expect, test } from "bun:test";
import { normalizeTasksSearch } from "./board-search";

describe("normalizeTasksSearch", () => {
  test("defaults to the board view with no params", () => {
    expect(normalizeTasksSearch({})).toEqual({ view: "board" });
  });

  test("keeps a valid view", () => {
    expect(normalizeTasksSearch({ view: "board" })).toEqual({ view: "board" });
    expect(normalizeTasksSearch({ view: "list" })).toEqual({ view: "list" });
  });

  test("falls back to board on an unknown view", () => {
    expect(normalizeTasksSearch({ view: "gantt" })).toEqual({ view: "board" });
  });

  test("falls back to board on a non-string view", () => {
    expect(normalizeTasksSearch({ view: 3 })).toEqual({ view: "board" });
  });

  test("drops unrelated junk params", () => {
    expect(normalizeTasksSearch({ view: "list", rogue: "1" })).toEqual({
      view: "list",
    });
  });

  test("tolerates non-object input", () => {
    expect(normalizeTasksSearch(undefined)).toEqual({ view: "board" });
    expect(normalizeTasksSearch(null)).toEqual({ view: "board" });
    expect(normalizeTasksSearch("view=list")).toEqual({ view: "board" });
  });
});
