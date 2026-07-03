// App-level coverage for the API-token bearer semantics. The binding
// rules under test: a present Authorization header decides the
// principal ALONE (valid token in, invalid/malformed out, the cookie is
// never consulted), and only such requests skip the CSRF origin check.

import { describe, expect, test } from "bun:test";
import { apiTokens } from "@halero/db";
import { eq } from "drizzle-orm";
import { createApiToken, mintApiTokenValue } from "./api-tokens";
import {
  completeSetup,
  makeTestApp,
  type StatusData,
  type TestApp,
  type TrpcSuccess,
  trpcMutation,
  trpcQuery,
} from "./test-utils";

interface BearerTestApp extends TestApp {
  readonly cookie: string;
  readonly tokenValue: string;
  readonly tokenId: string;
}

/** Sets up the app, signs in, and seeds one live API token. */
const makeBearerApp = async (): Promise<BearerTestApp> => {
  const testApp = makeTestApp();
  const cookie = await completeSetup(testApp.app);
  const tokenValue = mintApiTokenValue();
  const tokenId = createApiToken(
    testApp.database.db,
    "Raycast",
    tokenValue,
    testApp.clock.value,
  );
  return { ...testApp, cookie, tokenValue, tokenId };
};

const readAuthenticated = async (res: Response): Promise<boolean> => {
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<StatusData>;
  return json.result.data.authenticated;
};

describe("bearer happy path", () => {
  test("a valid token authenticates a protected tRPC query", async () => {
    const { app, tokenValue } = await makeBearerApp();

    const status = await trpcQuery(app, "system.status", {
      authorization: `Bearer ${tokenValue}`,
    });
    const baseUrl = await trpcQuery(app, "system.baseUrl", {
      authorization: `Bearer ${tokenValue}`,
    });

    expect(await readAuthenticated(status)).toBe(true);
    expect(baseUrl.status).toBe(200);
  });

  test("a valid token reaches module procedures", async () => {
    const { app, tokenValue } = await makeBearerApp();

    const res = await trpcQuery(app, "modules.tasks.list", {
      authorization: `Bearer ${tokenValue}`,
    });

    expect(res.status).toBe(200);
  });
});

describe("bearer rejections", () => {
  test("an unknown token is unauthenticated", async () => {
    const { app } = await makeBearerApp();

    const res = await trpcQuery(app, "system.baseUrl", {
      authorization: `Bearer ${mintApiTokenValue()}`,
    });

    expect(res.status).toBe(401);
  });

  test("a revoked token is unauthenticated", async () => {
    const { app, database, tokenValue, tokenId, clock } = await makeBearerApp();
    database.db
      .update(apiTokens)
      .set({ revokedAt: clock.value })
      .where(eq(apiTokens.id, tokenId))
      .run();

    const res = await trpcQuery(app, "system.baseUrl", {
      authorization: `Bearer ${tokenValue}`,
    });

    expect(res.status).toBe(401);
  });

  test("malformed Authorization headers are unauthenticated, never 500", async () => {
    const { app } = await makeBearerApp();
    const malformed = [
      "Bearer",
      "Bearer  ",
      "Bearer definitely-not-a-halero-token",
      "Basic dXNlcjpwYXNz",
    ];

    for (const authorization of malformed) {
      const res = await trpcQuery(app, "system.baseUrl", { authorization });
      expect(res.status).toBe(401);
    }
  });
});

describe("bearer wins, never falls back", () => {
  test("an invalid bearer with a VALID session cookie is 401", async () => {
    const { app, cookie } = await makeBearerApp();

    const res = await trpcQuery(app, "system.baseUrl", {
      cookie,
      authorization: `Bearer ${mintApiTokenValue()}`,
    });

    expect(res.status).toBe(401);
  });

  test("a non-Bearer Authorization header with a valid cookie is 401", async () => {
    const { app, cookie } = await makeBearerApp();

    const res = await trpcQuery(app, "system.baseUrl", {
      cookie,
      authorization: "Basic dXNlcjpwYXNz",
    });

    expect(res.status).toBe(401);
  });

  test("the CSRF exemption cannot be ridden by the cookie: cross-site mutation with a valid cookie and an invalid bearer is 401", async () => {
    const { app, cookie } = await makeBearerApp();

    // The exact attack the interlock exists for: a forged Authorization
    // header skips the origin check, so the cookie must not be able to
    // authenticate the request. Unauthenticated, not 200 and not 403.
    const res = await trpcMutation(
      app,
      "modules.tasks.create",
      { title: "Forged" },
      {
        cookie,
        origin: "https://evil.example.com",
        authorization: `Bearer ${mintApiTokenValue()}`,
      },
    );

    expect(res.status).toBe(401);
  });
});

describe("CSRF origin check and bearer requests", () => {
  test("a bearer mutation with a mismatched Origin succeeds", async () => {
    const { app, tokenValue } = await makeBearerApp();

    const res = await trpcMutation(
      app,
      "modules.tasks.create",
      { title: "From Raycast" },
      {
        origin: "https://evil.example.com",
        authorization: `Bearer ${tokenValue}`,
      },
    );

    expect(res.status).toBe(200);
  });

  test("a cookie mutation with a mismatched Origin is still 403", async () => {
    const { app, cookie } = await makeBearerApp();

    const res = await trpcMutation(
      app,
      "modules.tasks.create",
      { title: "Cross-site" },
      { cookie, origin: "https://evil.example.com" },
    );

    expect(res.status).toBe(403);
  });
});

describe("auth.logout as a token principal", () => {
  test("is rejected readably and leaves the token usable", async () => {
    const { app, tokenValue } = await makeBearerApp();

    const res = await trpcMutation(app, "auth.logout", undefined, {
      authorization: `Bearer ${tokenValue}`,
    });

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("revoke");
    const after = await trpcQuery(app, "system.status", {
      authorization: `Bearer ${tokenValue}`,
    });
    expect(await readAuthenticated(after)).toBe(true);
  });
});
