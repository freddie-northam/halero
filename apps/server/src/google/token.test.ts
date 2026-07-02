import { describe, expect, test } from "bun:test";
import { decryptCredentials, encryptCredentials } from "@halero/core";
import { connections } from "@halero/db";
import { eq } from "drizzle-orm";
import { makeTestApp, type TestApp } from "../test-utils";
import { saveGoogleClient } from "./client-config";
import { type ConnectionRow, getGoogleAccessToken } from "./token";

interface StoredCredentials {
  readonly refreshToken: string;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: number;
}

const seedConnection = (
  testApp: TestApp,
  credentials: StoredCredentials,
): ConnectionRow => {
  const { database, key, clock } = testApp;
  saveGoogleClient(database.db, key, {
    clientId: "1234-abc.apps.googleusercontent.com",
    clientSecret: "GOCSPX-super-secret-value",
  });
  database.db
    .insert(connections)
    .values({
      id: "conn-1",
      connectorId: "google-calendar",
      displayName: "Google Calendar",
      config: JSON.stringify({
        email: "person@example.com",
        accountKey: "google-sub-1",
      }),
      credentialsEnc: Buffer.from(
        encryptCredentials(key, JSON.stringify(credentials)),
      ),
      status: "active",
      nextSyncAt: clock.value,
      createdAt: clock.value,
    })
    .run();
  return reloadConnection(testApp);
};

const reloadConnection = (testApp: TestApp): ConnectionRow => {
  const row = testApp.database.db
    .select()
    .from(connections)
    .where(eq(connections.id, "conn-1"))
    .get();
  if (row === undefined) {
    throw new Error("expected the seeded connection to exist");
  }
  return row;
};

const failingFetch = (): Promise<Response> => {
  throw new Error("googleFetch must not be called for a fresh token");
};

const makeContext = (
  testApp: TestApp,
  googleFetch: (input: string | URL, init?: RequestInit) => Promise<Response>,
) => ({
  db: testApp.database.db,
  key: testApp.key,
  now: () => testApp.clock.value,
  googleFetch,
});

const rejectionOf = async (promise: Promise<unknown>): Promise<Error> => {
  const outcome = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  if (!(outcome instanceof Error)) {
    throw new Error("expected the promise to reject with an Error");
  }
  return outcome;
};

describe("getGoogleAccessToken", () => {
  test("returns the cached token while it is more than 60s from expiry", async () => {
    const testApp = makeTestApp();
    const row = seedConnection(testApp, {
      refreshToken: "1//refresh-a",
      accessToken: "ya29.cached",
      accessTokenExpiresAt: testApp.clock.value + 10 * 60 * 1000,
    });

    const token = await getGoogleAccessToken(
      makeContext(testApp, failingFetch),
      row,
    );

    expect(token).toBe("ya29.cached");
  });

  test("refreshes an expiring token and stores the updated credentials", async () => {
    const testApp = makeTestApp();
    const row = seedConnection(testApp, {
      refreshToken: "1//refresh-a",
      accessToken: "ya29.stale",
      accessTokenExpiresAt: testApp.clock.value + 30 * 1000,
    });
    const bodies: string[] = [];
    const googleFetch = (
      _input: string | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      bodies.push(String(init?.body ?? ""));
      return Promise.resolve(
        Response.json({
          access_token: "ya29.fresh",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      );
    };

    const token = await getGoogleAccessToken(
      makeContext(testApp, googleFetch),
      row,
    );

    expect(token).toBe("ya29.fresh");
    expect(bodies[0]).toContain("grant_type=refresh_token");
    expect(bodies[0]).toContain("refresh_token=1%2F%2Frefresh-a");

    const updated = reloadConnection(testApp);
    if (updated.credentialsEnc === null) {
      throw new Error("expected stored credentials");
    }
    const stored = JSON.parse(
      decryptCredentials(testApp.key, updated.credentialsEnc),
    ) as StoredCredentials;
    expect(stored).toEqual({
      refreshToken: "1//refresh-a",
      accessToken: "ya29.fresh",
      accessTokenExpiresAt: testApp.clock.value + 3600 * 1000,
    });
    expect(updated.status).toBe("active");
  });

  test("flips the connection to reauth_required on invalid_grant", async () => {
    const testApp = makeTestApp();
    const row = seedConnection(testApp, {
      refreshToken: "1//refresh-a",
      accessToken: "ya29.stale",
      accessTokenExpiresAt: testApp.clock.value - 1,
    });
    const googleFetch = (): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
        }),
      );

    const error = await rejectionOf(
      getGoogleAccessToken(makeContext(testApp, googleFetch), row),
    );

    expect(error.message).toContain("econnect");
    expect(error.message).not.toContain("1//refresh-a");
    expect(reloadConnection(testApp).status).toBe("reauth_required");
  });

  test("leaves status untouched when Google fails transiently", async () => {
    const testApp = makeTestApp();
    const row = seedConnection(testApp, {
      refreshToken: "1//refresh-a",
      accessToken: "ya29.stale",
      accessTokenExpiresAt: testApp.clock.value - 1,
    });
    const googleFetch = (): Promise<Response> =>
      Promise.resolve(new Response("upstream exploded", { status: 500 }));

    const error = await rejectionOf(
      getGoogleAccessToken(makeContext(testApp, googleFetch), row),
    );

    expect(error.message).not.toContain("1//refresh-a");
    const after = reloadConnection(testApp);
    expect(after.status).toBe("active");
    if (after.credentialsEnc === null) {
      throw new Error("expected stored credentials");
    }
    const stored = JSON.parse(
      decryptCredentials(testApp.key, after.credentialsEnc),
    ) as StoredCredentials;
    expect(stored.accessToken).toBe("ya29.stale");
  });
});
