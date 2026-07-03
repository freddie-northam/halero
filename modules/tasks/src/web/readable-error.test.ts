import { describe, expect, test } from "bun:test";
import { readableError } from "./readable-error";

// Defense-in-depth: the tRPC input layer should never leak a raw zod
// issue array to the Tasks UI (see the server-side numberInput fix for
// estimateMinutes/logTime.minutes), but this unwrap keeps any serialized
// zod array readable here too, mirroring apps/web/src/lib/errors.ts.
describe("readableError", () => {
  test("unwraps a serialized zod issue array to its readable messages", () => {
    const zodMessage = JSON.stringify([
      {
        code: "invalid_type",
        path: ["estimateMinutes"],
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
    expect(readableError(new Error("A task needs a title."))).toBe(
      "A task needs a title.",
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
