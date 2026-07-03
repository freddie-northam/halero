import { describe, expect, test } from "bun:test";
import {
  displayTitle,
  groupByKind,
  SEARCH_QUERY_MAX_LENGTH,
  truncateSearchQuery,
} from "./search-helpers";

describe("truncateSearchQuery", () => {
  test("pins the cap to the server's 200-character limit", () => {
    expect(SEARCH_QUERY_MAX_LENGTH).toBe(200);
  });

  test("trims surrounding whitespace", () => {
    expect(truncateSearchQuery("  standup  ")).toBe("standup");
  });

  test("truncates input past the cap", () => {
    const long = "a".repeat(250);
    expect(truncateSearchQuery(long)).toBe("a".repeat(200));
  });

  test("keeps input at the cap untouched", () => {
    const exact = "b".repeat(200);
    expect(truncateSearchQuery(exact)).toBe(exact);
  });

  test("turns whitespace-only input into the empty string", () => {
    expect(truncateSearchQuery("   ")).toBe("");
  });
});

describe("groupByKind", () => {
  test("groups by kind in first-appearance order", () => {
    const hits = [
      { kind: "calendar.event", id: "e1" },
      { kind: "task.item", id: "t1" },
      { kind: "calendar.event", id: "e2" },
    ];
    expect(groupByKind(hits)).toEqual([
      {
        kind: "calendar.event",
        hits: [
          { kind: "calendar.event", id: "e1" },
          { kind: "calendar.event", id: "e2" },
        ],
      },
      { kind: "task.item", hits: [{ kind: "task.item", id: "t1" }] },
    ]);
  });

  test("returns no groups for no hits", () => {
    expect(groupByKind([])).toEqual([]);
  });
});

describe("displayTitle", () => {
  test("strips highlight markers from the highlighted title", () => {
    expect(
      displayTitle({
        title: "Standup",
        titleHighlighted: `\u0001Standup\u0002`,
      }),
    ).toBe("Standup");
  });

  test("falls back to the raw title when the highlighted one is empty", () => {
    expect(displayTitle({ title: "Standup", titleHighlighted: "" })).toBe(
      "Standup",
    );
  });

  test("falls back to Untitled when both are empty", () => {
    expect(displayTitle({ title: null, titleHighlighted: "" })).toBe(
      "Untitled",
    );
    expect(displayTitle({ title: "", titleHighlighted: "" })).toBe("Untitled");
  });
});
