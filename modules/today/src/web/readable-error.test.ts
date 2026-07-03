import { describe, expect, test } from "bun:test";
import { readableError } from "./readable-error";

// Defense-in-depth: keeps any serialized zod issue array readable in this
// module's UI too, mirroring apps/web/src/lib/errors.ts and the tasks
// module's copy of the same unwrap.
describe("readableError", () => {
  test("unwraps a serialized zod issue array to its readable messages", () => {
    const zodMessage = JSON.stringify([
      {
        code: "invalid_type",
        path: ["someField"],
        message: "Invalid input: expected number, received number",
      },
    ]);
    expect(readableError(new Error(zodMessage))).toBe(
      "Invalid input: expected number, received number",
    );
  });

  test("joins multiple issue messages", () => {
    const zodMessage = JSON.stringify([
      { message: "First problem." },
      { message: "Second problem." },
    ]);
    expect(readableError(new Error(zodMessage))).toBe(
      "First problem. Second problem.",
    );
  });

  test("passes plain readable messages through untouched", () => {
    expect(readableError(new Error("Something specific broke."))).toBe(
      "Something specific broke.",
    );
  });

  test("leaves bracket-leading but non-zod messages alone", () => {
    expect(readableError(new Error("[core] something broke"))).toBe(
      "[core] something broke",
    );
    expect(readableError(new Error("[]"))).toBe("[]");
  });

  test("falls back for empty and non-Error values", () => {
    expect(readableError(new Error(""))).toBe(
      "Something went wrong. Please try again.",
    );
    expect(readableError(undefined)).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
