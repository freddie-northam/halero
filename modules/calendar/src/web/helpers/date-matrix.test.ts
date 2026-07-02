import { describe, expect, test } from "bun:test";
import {
  addDays,
  addMonths,
  isCalendarDate,
  mondayOf,
  monthMatrix,
  monthOf,
  weekDates,
} from "./date-matrix";

describe("isCalendarDate", () => {
  test("accepts real YYYY-MM-DD dates", () => {
    expect(isCalendarDate("2026-07-02")).toBe(true);
    expect(isCalendarDate("2024-02-29")).toBe(true);
  });

  test("rejects malformed strings", () => {
    expect(isCalendarDate("02/07/2026")).toBe(false);
    expect(isCalendarDate("2026-7-2")).toBe(false);
    expect(isCalendarDate("today")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
  });

  test("rejects well-formed strings that are not real dates", () => {
    expect(isCalendarDate("2023-02-31")).toBe(false);
    expect(isCalendarDate("2023-02-29")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("2026-00-10")).toBe(false);
  });
});

describe("addDays", () => {
  test("moves across month and year boundaries", () => {
    expect(addDays("2026-07-02", 1)).toBe("2026-07-03");
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  test("handles leap February", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2023-02-28", 1)).toBe("2023-03-01");
  });
});

describe("mondayOf", () => {
  test("snaps back to the Monday of the week", () => {
    // 2026-07-02 is a Thursday.
    expect(mondayOf("2026-07-02")).toBe("2026-06-29");
  });

  test("keeps a Monday as-is", () => {
    expect(mondayOf("2026-06-29")).toBe("2026-06-29");
  });

  test("treats Sunday as the last day of the week, not the first", () => {
    // 2026-07-05 is a Sunday; a Monday-start week began on 2026-06-29.
    expect(mondayOf("2026-07-05")).toBe("2026-06-29");
  });
});

describe("weekDates", () => {
  test("returns the 7 dates of the Monday-start week around the anchor", () => {
    expect(weekDates("2025-07-02")).toEqual([
      "2025-06-30",
      "2025-07-01",
      "2025-07-02",
      "2025-07-03",
      "2025-07-04",
      "2025-07-05",
      "2025-07-06",
    ]);
  });
});

describe("monthOf and addMonths", () => {
  test("monthOf extracts the calendar month", () => {
    expect(monthOf("2026-07-02")).toBe("2026-07");
  });

  test("addMonths lands on the first of the shifted month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-01");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    expect(addMonths("2026-07-04", 0)).toBe("2026-07-01");
  });
});

describe("monthMatrix", () => {
  test("is always a fixed 6x7 grid", () => {
    for (const anchor of ["2026-07-15", "2025-09-10", "2026-02-14"]) {
      const matrix = monthMatrix(anchor);
      expect(matrix).toHaveLength(6);
      for (const week of matrix) {
        expect(week).toHaveLength(7);
      }
    }
  });

  test("starts on the Monday of the week containing the 1st", () => {
    // 2026-07-01 is a Wednesday; its week began on Monday 2026-06-29.
    const matrix = monthMatrix("2026-07-15");
    expect(matrix[0]?.[0]).toBe("2026-06-29");
    expect(matrix[0]?.[2]).toBe("2026-07-01");
    expect(matrix[5]?.[6]).toBe("2026-08-09");
  });

  test("starts on the 1st itself when the month begins on a Monday", () => {
    // 2025-09-01 is a Monday.
    const matrix = monthMatrix("2025-09-10");
    expect(matrix[0]?.[0]).toBe("2025-09-01");
    expect(matrix[5]?.[6]).toBe("2025-10-12");
  });

  test("pads six leading days when the month begins on a Sunday", () => {
    // 2026-02-01 is a Sunday, the last cell of a Monday-start week.
    const matrix = monthMatrix("2026-02-14");
    expect(matrix[0]).toEqual([
      "2026-01-26",
      "2026-01-27",
      "2026-01-28",
      "2026-01-29",
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
    ]);
  });

  test("crosses a year boundary in the leading week", () => {
    // 2026-01-01 is a Thursday; the grid starts back in December 2025.
    const matrix = monthMatrix("2026-01-01");
    expect(matrix[0]?.[0]).toBe("2025-12-29");
    expect(matrix[0]?.[3]).toBe("2026-01-01");
  });

  test("every consecutive cell is exactly one day apart", () => {
    const cells = monthMatrix("2026-07-15").flat();
    for (const [index, cell] of cells.entries()) {
      if (index === 0) {
        continue;
      }
      expect(cell).toBe(addDays(cells[index - 1] ?? "", 1));
    }
  });
});
