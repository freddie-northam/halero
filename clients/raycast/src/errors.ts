// The pure failure taxonomy shared by the three API commands: one
// message per way a call can fail, so search, agenda, and add-task all
// explain problems identically. The Raycast toast surfaces live in
// feedback.tsx; this module stays importable under bun test.

import { TRPCClientError } from "@trpc/client";

/** Shown when an API command runs without a configured token. */
export const MISSING_TOKEN_MESSAGE =
  "Add your API token in the extension preferences.";

type FailureKind = "unauthorized" | "unreachable" | "other";

/** The slice of a tRPC error envelope the taxonomy needs. */
interface EnvelopeData {
  readonly code?: unknown;
  readonly httpStatus?: unknown;
}

const classify = (error: unknown): FailureKind => {
  if (error instanceof TRPCClientError) {
    const data: unknown = error.data;
    if (data === null || data === undefined) {
      // No parsed tRPC envelope means nothing at the base URL answered
      // as Halero: a refused connection or a non-tRPC response.
      return "unreachable";
    }
    const { code, httpStatus } = data as EnvelopeData;
    if (code === "UNAUTHORIZED" || httpStatus === 401) {
      return "unauthorized";
    }
    return "other";
  }
  // fetch rejects network failures as TypeErrors; cover the case where
  // one escapes without the tRPC client wrapping it.
  return error instanceof TypeError ? "unreachable" : "other";
};

/** Server-side tRPC errors already carry readable messages; anything
 * else falls back to a generic line (the web readable-error pattern). */
const readableMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return "Something went wrong. Please try again.";
};

/** One readable line for any failed API call. */
export const apiFailureMessage = (error: unknown, baseUrl: string): string => {
  switch (classify(error)) {
    case "unauthorized":
      return "Your API token was rejected. Mint a new one in Halero Settings.";
    case "unreachable":
      return `Could not reach Halero at ${baseUrl}. Is it running?`;
    case "other":
      return readableMessage(error);
  }
};
