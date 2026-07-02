import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  test("applies defaults when env is empty", () => {
    const config = loadConfig({});

    expect(config.dataDir).toBe("./data");
    expect(config.port).toBe(4253);
    expect(config.baseUrl.origin).toBe("http://localhost:4253");
  });

  test("reads data dir and port from env", () => {
    const config = loadConfig({
      HALERO_DATA_DIR: "/srv/halero",
      HALERO_PORT: "8080",
    });

    expect(config.dataDir).toBe("/srv/halero");
    expect(config.port).toBe(8080);
  });

  test("base URL defaults to localhost with the configured port", () => {
    const config = loadConfig({ HALERO_PORT: "5000" });

    expect(config.baseUrl.origin).toBe("http://localhost:5000");
  });

  test("uses an explicit base URL when provided", () => {
    const config = loadConfig({
      HALERO_BASE_URL: "https://halero.example.com",
    });

    expect(config.baseUrl.origin).toBe("https://halero.example.com");
    expect(config.baseUrl.protocol).toBe("https:");
  });

  test("rejects an invalid base URL with a readable error", () => {
    expect(() => loadConfig({ HALERO_BASE_URL: "not a url" })).toThrow(
      /HALERO_BASE_URL must be a full URL/,
    );
  });

  test("rejects a base URL without an http(s) scheme", () => {
    // "localhost:4253" parses as scheme "localhost:", which would make
    // the origin "null" and let sandboxed-iframe requests pass CSRF.
    for (const value of ["localhost:4253", "ftp://halero.example.com"]) {
      expect(() => loadConfig({ HALERO_BASE_URL: value })).toThrow(
        /http:\/\/ or https:\/\//,
      );
    }
  });

  test("rejects a non-numeric port with a readable error", () => {
    expect(() => loadConfig({ HALERO_PORT: "banana" })).toThrow(
      /HALERO_PORT must be a whole number/,
    );
  });

  test("rejects an out-of-range port with a readable error", () => {
    expect(() => loadConfig({ HALERO_PORT: "70000" })).toThrow(
      /HALERO_PORT must be between 1 and 65535/,
    );
  });
});
