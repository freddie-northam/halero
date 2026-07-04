/**
 * Turns an unknown thrown value into a message safe to show a person.
 * Server-side errors already carry readable messages; anything else
 * (network failures, bugs) falls back to a generic line.
 */
export const readableError = (error: unknown): string => {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return "Something went wrong. Please try again.";
};
