import { describe, expect, test } from "bun:test";
import type { FetchLike } from "@halero/connector-sdk";
import { exchangeToken, getLiveToken, resetLiveTokenCache } from "./token";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status });

const credential = { username: "u", password: "p" };

describe("exchangeToken", () => {
  test("returns the token and its absolute expiry", async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve(
        jsonResponse(200, { access_token: "abc", expires_in: "3600" }),
      );
    const token = await exchangeToken(fetchImpl, credential, 1_000);
    expect(token.token).toBe("abc");
    expect(token.expiresAt).toBe(1_000 + 3600 * 1000);
  });

  test("throws a readable error when the credentials are rejected", async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve(jsonResponse(401, { detail: "nope" }));
    await expect(exchangeToken(fetchImpl, credential, 0)).rejects.toThrow(
      /did not accept/i,
    );
  });

  test("throws when the endpoint is unreachable", async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new Error("down"));
    await expect(exchangeToken(fetchImpl, credential, 0)).rejects.toThrow(
      /could not reach/i,
    );
  });
});

describe("getLiveToken", () => {
  test("caches the token until close to expiry, then re-exchanges", async () => {
    resetLiveTokenCache();
    let calls = 0;
    const fetchImpl: FetchLike = () => {
      calls += 1;
      return Promise.resolve(
        jsonResponse(200, { access_token: `t${calls}`, expires_in: "3600" }),
      );
    };
    let clock = 0;
    const now = () => clock;
    expect(await getLiveToken(fetchImpl, credential, now)).toBe("t1");
    clock = 1000; // well within the hour
    expect(await getLiveToken(fetchImpl, credential, now)).toBe("t1");
    expect(calls).toBe(1);
    clock = 3600 * 1000; // past the refresh margin
    expect(await getLiveToken(fetchImpl, credential, now)).toBe("t2");
    expect(calls).toBe(2);
  });
});
