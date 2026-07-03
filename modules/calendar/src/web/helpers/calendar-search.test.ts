import { describe, expect, test } from "bun:test";
import { normalizeCalendarSearch, viewWindow } from "./calendar-search";

describe("normalizeCalendarSearch", () => {
  test("defaults to the agenda view with no date", () => {
    expect(normalizeCalendarSearch({})).toEqual({ view: "agenda" });
  });

  test("keeps a valid view and date", () => {
    expect(
      normalizeCalendarSearch({ view: "month", date: "2026-07-02" }),
    ).toEqual({ view: "month", date: "2026-07-02" });
    expect(normalizeCalendarSearch({ view: "week" })).toEqual({
      view: "week",
    });
    expect(normalizeCalendarSearch({ view: "agenda" })).toEqual({
      view: "agenda",
    });
    expect(normalizeCalendarSearch({ view: "list" })).toEqual({
      view: "list",
    });
  });

  test("drops unknown views, bad dates, and junk params", () => {
    expect(
      normalizeCalendarSearch({
        view: "year",
        date: "2023-02-31",
        rogue: "1",
      }),
    ).toEqual({ view: "agenda" });
    expect(normalizeCalendarSearch({ view: 3, date: 20260702 })).toEqual({
      view: "agenda",
    });
  });

  test("tolerates non-object input", () => {
    expect(normalizeCalendarSearch(undefined)).toEqual({ view: "agenda" });
    expect(normalizeCalendarSearch("view=month")).toEqual({ view: "agenda" });
  });
});

describe("viewWindow", () => {
  test("agenda covers 7 days from the anchor, half-open", () => {
    expect(viewWindow("agenda", "2025-07-02")).toEqual({
      from: "2025-07-02",
      to: "2025-07-09",
    });
  });

  test("week covers Monday through the next Monday", () => {
    // 2025-07-02 is a Wednesday.
    expect(viewWindow("week", "2025-07-02")).toEqual({
      from: "2025-06-30",
      to: "2025-07-07",
    });
  });

  test("month covers the whole fixed 6x7 grid", () => {
    // The July 2026 grid runs Monday 2026-06-29 through Sunday 2026-08-09.
    expect(viewWindow("month", "2026-07-15")).toEqual({
      from: "2026-06-29",
      to: "2026-08-10",
    });
  });

  test("list shares the month view's window", () => {
    expect(viewWindow("list", "2026-07-15")).toEqual(
      viewWindow("month", "2026-07-15"),
    );
  });
});
