// Shared pieces of the Google Calendar connector, deliberately hardcoded
// inside the server for v0.1. A connector SDK gets extracted later from
// this working code.

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_SCOPES =
  "openid email https://www.googleapis.com/auth/calendar.readonly";
export const GOOGLE_CONNECTOR_ID = "google-calendar";

/**
 * Narrow fetch signature used for every call to Google, so tests can inject
 * a fake and no test ever touches the network.
 */
export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;
