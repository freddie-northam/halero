import { describe, expect, test } from "bun:test";
import { readableError } from "./errors";

// Regression: ISSUE-002, the Settings server-address form showed a raw
// serialized zod issue array instead of the readable message inside it.
// Found by /qa on 2026-07-02.
describe("readableError", () => {
  test("unwraps a serialized zod issue array to its readable messages", () => {
    const zodMessage = JSON.stringify([
      {
        code: "custom",
        path: ["baseUrl"],
        message:
          "Base URL must be a full URL starting with http:// or https://.",
      },
    ]);
    expect(readableError(new Error(zodMessage))).toBe(
      "Base URL must be a full URL starting with http:// or https://.",
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
    expect(readableError(new Error("Incorrect password."))).toBe(
      "Incorrect password.",
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
