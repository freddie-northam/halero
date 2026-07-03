import { describe, expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { apiFailureMessage, MISSING_TOKEN_MESSAGE } from "./errors";

const BASE = "http://localhost:4253";

/** A tRPC error envelope the way the server's handler emits it. */
const envelope = (code: string, httpStatus: number, message: string) =>
  TRPCClientError.from({
    error: { code: -32001, message, data: { code, httpStatus } },
  });

describe("MISSING_TOKEN_MESSAGE", () => {
  test("carries the exact preference nudge", () => {
    expect(MISSING_TOKEN_MESSAGE).toBe(
      "Add your API token in the extension preferences.",
    );
  });
});

describe("apiFailureMessage", () => {
  test("maps a 401 envelope to the rejected-token message", () => {
    const error = envelope(
      "UNAUTHORIZED",
      401,
      "You need to sign in before doing that.",
    );
    expect(apiFailureMessage(error, BASE)).toBe(
      "Your API token was rejected. Mint a new one in Halero Settings.",
    );
  });

  test("maps a wrapped network failure to the unreachable message", () => {
    const error = TRPCClientError.from(new TypeError("fetch failed"));
    expect(apiFailureMessage(error, BASE)).toBe(
      `Could not reach Halero at ${BASE}. Is it running?`,
    );
  });

  test("maps a bare fetch TypeError to the unreachable message", () => {
    expect(apiFailureMessage(new TypeError("fetch failed"), BASE)).toBe(
      `Could not reach Halero at ${BASE}. Is it running?`,
    );
  });

  test("passes the server's readable message through for other codes", () => {
    const message = '"2026-99-01" is not a calendar date; expected YYYY-MM-DD.';
    const error = envelope("BAD_REQUEST", 400, message);
    expect(apiFailureMessage(error, BASE)).toBe(message);
  });

  test("passes a plain error message through", () => {
    expect(apiFailureMessage(new Error("boom"), BASE)).toBe("boom");
  });

  test("falls back to a generic line for unreadable values", () => {
    const generic = "Something went wrong. Please try again.";
    expect(apiFailureMessage(new Error(""), BASE)).toBe(generic);
    expect(apiFailureMessage(42, BASE)).toBe(generic);
  });
});
