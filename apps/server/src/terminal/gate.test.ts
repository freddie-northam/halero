import { describe, expect, test } from "bun:test";
import { isLoopbackAddress, terminalRouteAllowed } from "./gate";

describe("isLoopbackAddress", () => {
  test("accepts IPv4, IPv6, and mapped loopback", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.1.2.3")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("localhost")).toBe(true);
  });

  test("rejects non-loopback addresses", () => {
    expect(isLoopbackAddress("192.168.1.10")).toBe(false);
    expect(isLoopbackAddress("10.0.0.5")).toBe(false);
    expect(isLoopbackAddress("203.0.113.7")).toBe(false);
    expect(isLoopbackAddress("")).toBe(false);
    expect(isLoopbackAddress("128.0.0.1")).toBe(false);
  });
});

describe("terminalRouteAllowed", () => {
  test("requires both the opt-in flag and a loopback client", () => {
    expect(terminalRouteAllowed({ developerTerminal: true }, "127.0.0.1")).toBe(
      true,
    );
    expect(
      terminalRouteAllowed({ developerTerminal: false }, "127.0.0.1"),
    ).toBe(false);
    expect(
      terminalRouteAllowed({ developerTerminal: true }, "192.168.1.10"),
    ).toBe(false);
    expect(terminalRouteAllowed({ developerTerminal: true }, null)).toBe(false);
  });
});
