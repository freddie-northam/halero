import { describe, expect, test } from "bun:test";
import { formatDueDate, isDueOrOverdue } from "./due-date";

describe("isDueOrOverdue", () => {
  test("flags a due date before today", () => {
    expect(isDueOrOverdue("2025-06-30", "2025-07-02")).toBe(true);
  });

  test("flags a due date exactly today", () => {
    expect(isDueOrOverdue("2025-07-02", "2025-07-02")).toBe(true);
  });

  test("leaves a future due date alone", () => {
    expect(isDueOrOverdue("2025-07-03", "2025-07-02")).toBe(false);
  });

  test("leaves a dateless task alone", () => {
    expect(isDueOrOverdue(null, "2025-07-02")).toBe(false);
  });

  test("compares across year boundaries lexicographically", () => {
    expect(isDueOrOverdue("2024-12-31", "2025-01-01")).toBe(true);
    expect(isDueOrOverdue("2026-01-01", "2025-12-31")).toBe(false);
  });
});

describe("formatDueDate", () => {
  test("drops the year when the due date shares today's year", () => {
    expect(formatDueDate("2025-07-02", "2025-07-02")).toBe("2 Jul");
  });

  test("keeps the year when it differs from today's", () => {
    expect(formatDueDate("2024-12-31", "2025-07-02")).toBe("31 Dec 2024");
    expect(formatDueDate("2026-01-05", "2025-07-02")).toBe("5 Jan 2026");
  });
});
