// The JSON wire protocol for the terminal WebSocket. Kept tiny and pure
// so both the route and its tests share one parser. Client frames drive a
// PtySession; server frames carry its output and exit code.

export type ClientMessage =
  | { readonly type: "input"; readonly data: string }
  | { readonly type: "resize"; readonly cols: number; readonly rows: number };

export type ServerMessage =
  | { readonly type: "data"; readonly data: string }
  | { readonly type: "exit"; readonly code: number };

const isPositiveInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/** Parses a raw client frame, returning null for anything malformed. */
export const parseClientMessage = (raw: string): ClientMessage | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const message = parsed as Record<string, unknown>;
  if (message.type === "input" && typeof message.data === "string") {
    return { type: "input", data: message.data };
  }
  if (
    message.type === "resize" &&
    isPositiveInt(message.cols) &&
    isPositiveInt(message.rows)
  ) {
    return { type: "resize", cols: message.cols, rows: message.rows };
  }
  return null;
};

export const serverDataFrame = (data: string): string =>
  JSON.stringify({ type: "data", data } satisfies ServerMessage);

export const serverExitFrame = (code: number): string =>
  JSON.stringify({ type: "exit", code } satisfies ServerMessage);
