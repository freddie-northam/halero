import { describe, expect, mock, test } from "bun:test";

// @raycast/api ships type declarations only; its implementation is injected
// by the Raycast runtime. Mock it before importing api.ts so the module
// graph never tries to load the real (entry-less) package.
mock.module("@raycast/api", () => ({
  getPreferenceValues: () => ({
    baseUrl: "http://localhost:4253",
    apiToken: "secret-token",
  }),
}));

const { authHeaders, createHaleroClient, getPrefs } = await import("./api");

describe("authHeaders", () => {
  test("includes the bearer header only when a token is set", () => {
    expect(authHeaders("secret-token")).toEqual({
      Authorization: "Bearer secret-token",
    });
    expect(authHeaders(undefined)).toEqual({});
    expect(authHeaders("")).toEqual({});
  });
});

describe("createHaleroClient", () => {
  test("constructs a client without touching the network", () => {
    const client = createHaleroClient({ baseUrl: "http://localhost:4253" });
    expect(client).toBeDefined();
  });

  test("tolerates a trailing slash in the base URL", () => {
    const client = createHaleroClient({
      baseUrl: "http://localhost:4253/",
      apiToken: "secret-token",
    });
    expect(client).toBeDefined();
  });
});

describe("getPrefs", () => {
  test("returns the Raycast preference values", () => {
    expect(getPrefs()).toEqual({
      baseUrl: "http://localhost:4253",
      apiToken: "secret-token",
    });
  });
});
