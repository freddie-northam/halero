import { describe, expect, test } from "bun:test";
import { isHttpsOk } from "./client-config";

describe("isHttpsOk", () => {
  test("accepts https on any host", () => {
    expect(isHttpsOk(new URL("https://halero.example.com"))).toBe(true);
  });

  test("accepts plain http on loopback hosts, including IPv6", () => {
    expect(isHttpsOk(new URL("http://localhost:4253"))).toBe(true);
    expect(isHttpsOk(new URL("http://127.0.0.1:4253"))).toBe(true);
    // Google's loopback exception covers [::1] too.
    expect(isHttpsOk(new URL("http://[::1]:4253"))).toBe(true);
  });

  test("rejects plain http on non-loopback hosts", () => {
    expect(isHttpsOk(new URL("http://halero.example.com"))).toBe(false);
    expect(isHttpsOk(new URL("http://192.168.1.10:4253"))).toBe(false);
  });
});
