import { describe, expect, test } from "bun:test";
import { resolveEntryRoute } from "./resolve-entry-route";

describe("resolveEntryRoute", () => {
  test("routes to /setup when the instance still needs setup", () => {
    expect(resolveEntryRoute({ needsSetup: true, authenticated: false })).toBe(
      "/setup",
    );
  });

  test("routes to /login when set up but not authenticated", () => {
    expect(resolveEntryRoute({ needsSetup: false, authenticated: false })).toBe(
      "/login",
    );
  });

  test("routes to / when set up and authenticated", () => {
    expect(resolveEntryRoute({ needsSetup: false, authenticated: true })).toBe(
      "/",
    );
  });

  test("setup wins over authentication when both flags are set", () => {
    expect(resolveEntryRoute({ needsSetup: true, authenticated: true })).toBe(
      "/setup",
    );
  });
});
