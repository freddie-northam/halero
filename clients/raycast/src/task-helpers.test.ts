import { describe, expect, test } from "bun:test";
import { taskCreateInput } from "./task-helpers";

describe("taskCreateInput", () => {
  test("sends the title alone when no due date is given", () => {
    expect(taskCreateInput({ title: "Buy milk" })).toEqual({
      title: "Buy milk",
    });
  });

  test("omits the dueDate key entirely for blank due input", () => {
    expect("dueDate" in taskCreateInput({ title: "Buy milk", due: "" })).toBe(
      false,
    );
    expect(
      "dueDate" in taskCreateInput({ title: "Buy milk", due: "   " }),
    ).toBe(false);
  });

  test("trims the due date argument", () => {
    expect(taskCreateInput({ title: "Buy milk", due: " 2026-07-04 " })).toEqual(
      { title: "Buy milk", dueDate: "2026-07-04" },
    );
  });

  test("passes the title through untouched for the server to validate", () => {
    expect(taskCreateInput({ title: "  " })).toEqual({ title: "  " });
  });

  test("passes a non-date due value through for the server to reject", () => {
    expect(taskCreateInput({ title: "Buy milk", due: "tomorrow" })).toEqual({
      title: "Buy milk",
      dueDate: "tomorrow",
    });
  });
});
