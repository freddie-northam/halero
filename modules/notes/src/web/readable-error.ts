/**
 * Turns an unknown thrown value into a message safe to show a person.
 * Server-side tRPC errors already carry readable messages; anything else
 * (network failures, bugs) falls back to a generic line.
 */
export const readableError = (error: unknown): string => {
  if (error instanceof Error && error.message.trim() !== "") {
    return zodIssuesMessage(error.message) ?? error.message;
  }
  return "Something went wrong. Please try again.";
};

/**
 * tRPC input-validation failures arrive with the zod issue array serialized
 * as the error message. Showing that JSON to a person is a bug; the issues
 * inside already carry readable sentences, so surface those instead.
 */
const zodIssuesMessage = (message: string): string | null => {
  if (!message.startsWith("[")) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(message);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }
    const messages = parsed
      .map((issue) =>
        typeof issue === "object" && issue !== null && "message" in issue
          ? String((issue as { message: unknown }).message)
          : null,
      )
      .filter((text): text is string => text !== null && text.trim() !== "");
    return messages.length > 0 ? messages.join(" ") : null;
  } catch {
    return null;
  }
};
