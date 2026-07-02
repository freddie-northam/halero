// Tiny defensive JSON readers shared by connectors and hosts when
// walking untyped provider payloads.

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;
