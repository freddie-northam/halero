import { describe, expect, test } from "bun:test";
import { decryptCredentials } from "@halero/core";
import { entities, externalRefs } from "@halero/db";
import {
  completeSetup,
  type MakeTestAppOptions,
  makeTestApp,
  type TestApp,
  trpcMutation,
} from "../test-utils";

const clientInput = {
  clientId: "1234-abc.apps.googleusercontent.com",
  clientSecret: "GOCSPX-super-secret-value",
};

const b64url = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const makeIdToken = (sub: string, email: string): string =>
  `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({ sub, email })}.fake-signature`;

const tokenPayload = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  access_token: "ya29.test-access",
  expires_in: 3599,
  refresh_token: "1//plain-refresh-token",
  id_token: makeIdToken("google-sub-1", "person@example.com"),
  scope: "openid email https://www.googleapis.com/auth/calendar.readonly",
  token_type: "Bearer",
  ...overrides,
});

interface RecordedCall {
  readonly url: string;
  readonly body: string;
}

interface GoogleFetchStub {
  readonly fetchImpl: NonNullable<MakeTestAppOptions["outboundFetch"]>;
  readonly calls: RecordedCall[];
}

const googleFetchStub = (
  respond: (call: number) => Response,
): GoogleFetchStub => {
  const calls: RecordedCall[] = [];
  const fetchImpl = (
    input: string | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    calls.push({ url: String(input), body: String(init?.body ?? "") });
    return Promise.resolve(respond(calls.length));
  };
  return { fetchImpl, calls };
};

const okTokenFetch = (
  overrides: Record<string, unknown> = {},
): GoogleFetchStub =>
  googleFetchStub(() => Response.json(tokenPayload(overrides)));

interface ConnectionRowRaw {
  readonly id: string;
  readonly connector_id: string;
  readonly config: string;
  readonly credentials_enc: Uint8Array;
  readonly status: string;
  readonly next_sync_at: number;
  readonly consecutive_failures: number;
  readonly last_error: string | null;
}

const readConnections = (database: TestApp["database"]): ConnectionRowRaw[] =>
  database.sqlite
    .query<ConnectionRowRaw, []>("SELECT * FROM connections")
    .all();

const onlyConnection = (database: TestApp["database"]): ConnectionRowRaw => {
  const rows = readConnections(database);
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new Error(`expected exactly one connection, found ${rows.length}`);
  }
  return row;
};

const readSetting = (
  database: TestApp["database"],
  key: string,
): string | null => {
  const row = database.sqlite
    .query<{ value: string }, [string]>(
      "SELECT value FROM settings WHERE key = ?",
    )
    .get(key);
  return row?.value ?? null;
};

const requestStart = (
  app: TestApp["app"],
  cookie?: string,
): Promise<Response> =>
  Promise.resolve(
    app.fetch(
      new Request("http://localhost/api/oauth/google-calendar/start", {
        headers: cookie === undefined ? {} : { cookie },
      }),
    ),
  );

const requestCallback = (
  app: TestApp["app"],
  params: string,
  cookie?: string,
): Promise<Response> =>
  Promise.resolve(
    app.fetch(
      new Request(
        `http://localhost/api/oauth/google-calendar/callback?${params}`,
        {
          headers: cookie === undefined ? {} : { cookie },
        },
      ),
    ),
  );

const stateFromLocation = (res: Response): string => {
  const location = res.headers.get("location");
  if (location === null) {
    throw new Error("expected a Location header on the start redirect");
  }
  const state = new URL(location).searchParams.get("state");
  if (state === null) {
    throw new Error("expected a state param in the Google auth URL");
  }
  return state;
};

/** Setup + saved client + signed-in cookie: ready to run the OAuth flow. */
const readyApp = async (
  options: MakeTestAppOptions = {},
): Promise<TestApp & { cookie: string }> => {
  const testApp = makeTestApp(options);
  const cookie = await completeSetup(testApp.app);
  const saved = await trpcMutation(
    testApp.app,
    "connections.saveOauthClient",
    { connectorId: "google-calendar", ...clientInput },
    { cookie },
  );
  expect(saved.status).toBe(200);
  return { ...testApp, cookie };
};

describe("GET /api/oauth/google/start", () => {
  test("redirects to Google with offline access, consent, and the exact redirect URI", async () => {
    const { app, database, cookie } = await readyApp({
      baseUrl: "https://halero.example.com",
    });

    const res = await requestStart(app, cookie);

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.pathname).toBe("/o/oauth2/v2/auth");
    expect(location.searchParams.get("client_id")).toBe(clientInput.clientId);
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://halero.example.com/api/oauth/google-calendar/callback",
    );
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("scope")).toBe(
      "openid email https://www.googleapis.com/auth/calendar.readonly",
    );
    expect(location.searchParams.get("access_type")).toBe("offline");
    expect(location.searchParams.get("prompt")).toBe("consent");
    expect(location.href).not.toContain(clientInput.clientSecret);

    const state = location.searchParams.get("state") ?? "";
    expect(state.length).toBe(64);
    expect(readSetting(database, "oauth_state")).toContain(state);
  });

  test("rejects without a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);

    const res = await requestStart(app);

    expect(res.status).toBe(401);
    expect(await res.text()).toContain("sign in");
  });

  test("rejects when the OAuth client is not configured yet", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);

    const res = await requestStart(app, cookie);

    expect(res.status).toBe(409);
    expect(await res.text()).toContain("client");
  });

  test("rejects a plain-http non-localhost base URL with HTTPS guidance", async () => {
    const { app, cookie } = await readyApp({
      baseUrl: "http://halero.internal:8080",
    });

    const res = await requestStart(app, cookie);

    expect(res.status).toBe(409);
    expect(await res.text()).toContain("HTTPS");
  });
});

describe("GET /api/oauth/google/callback", () => {
  test("rejects without a session", async () => {
    const { app } = await readyApp();

    const res = await requestCallback(app, "code=x&state=y");

    expect(res.status).toBe(401);
  });

  test("happy path stores an active connection with encrypted tokens", async () => {
    const google = okTokenFetch();
    const { app, database, clock, key, cookie } = await readyApp({
      baseUrl: "https://halero.example.com",
      outboundFetch: google.fetchImpl,
    });
    const start = await requestStart(app, cookie);
    const state = stateFromLocation(start);

    const res = await requestCallback(
      app,
      `code=auth-code-1&state=${state}`,
      cookie,
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "/settings/integrations?connected=1",
    );

    const row = onlyConnection(database);
    expect(row.connector_id).toBe("google-calendar");
    expect(row.status).toBe("active");
    expect(row.next_sync_at).toBe(clock.value);
    expect(JSON.parse(row.config)).toEqual({
      email: "person@example.com",
      accountKey: "google-sub-1",
    });

    const blob = Buffer.from(row.credentials_enc);
    expect(blob.includes(Buffer.from("1//plain-refresh-token"))).toBe(false);
    const credentials = JSON.parse(
      decryptCredentials(key, row.credentials_enc),
    ) as Record<string, unknown>;
    expect(credentials).toEqual({
      refreshToken: "1//plain-refresh-token",
      accessToken: "ya29.test-access",
      accessTokenExpiresAt: clock.value + 3599 * 1000,
    });

    expect(google.calls.length).toBe(1);
    expect(google.calls[0]?.url).toBe("https://oauth2.googleapis.com/token");
    expect(google.calls[0]?.body).toContain("grant_type=authorization_code");
    expect(google.calls[0]?.body).toContain("code=auth-code-1");

    expect(readSetting(database, "oauth_state")).toBeNull();
  });

  test("rejects a state that does not match", async () => {
    const google = okTokenFetch();
    const { app, database, cookie } = await readyApp({
      outboundFetch: google.fetchImpl,
    });
    await requestStart(app, cookie);

    const res = await requestCallback(
      app,
      "code=auth-code-1&state=not-the-real-state",
      cookie,
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "/settings/integrations?error=state_invalid&connector=google-calendar",
    );
    expect(readConnections(database).length).toBe(0);
    expect(google.calls.length).toBe(0);
  });

  test("rejects an expired state", async () => {
    const google = okTokenFetch();
    const { app, database, clock, cookie } = await readyApp({
      outboundFetch: google.fetchImpl,
    });
    const start = await requestStart(app, cookie);
    const state = stateFromLocation(start);
    clock.value += 10 * 60 * 1000 + 1;

    const res = await requestCallback(
      app,
      `code=auth-code-1&state=${state}`,
      cookie,
    );

    expect(res.headers.get("location")).toBe(
      "/settings/integrations?error=state_invalid&connector=google-calendar",
    );
    expect(readConnections(database).length).toBe(0);
  });

  test("rejects a reused state", async () => {
    const google = okTokenFetch();
    const { app, database, cookie } = await readyApp({
      outboundFetch: google.fetchImpl,
    });
    const start = await requestStart(app, cookie);
    const state = stateFromLocation(start);
    await requestCallback(app, `code=auth-code-1&state=${state}`, cookie);

    const res = await requestCallback(
      app,
      `code=auth-code-2&state=${state}`,
      cookie,
    );

    expect(res.headers.get("location")).toBe(
      "/settings/integrations?error=state_invalid&connector=google-calendar",
    );
    expect(readConnections(database).length).toBe(1);
    expect(google.calls.length).toBe(1);
  });

  test("redirects with an error and stores nothing when the token exchange fails", async () => {
    const google = googleFetchStub(
      () =>
        new Response(JSON.stringify({ error: "invalid_client" }), {
          status: 401,
        }),
    );
    const { app, database, cookie } = await readyApp({
      outboundFetch: google.fetchImpl,
    });
    const start = await requestStart(app, cookie);
    const state = stateFromLocation(start);

    const res = await requestCallback(
      app,
      `code=auth-code-1&state=${state}`,
      cookie,
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "/settings/integrations?error=token_exchange_failed&connector=google-calendar",
    );
    expect(readConnections(database).length).toBe(0);
  });

  test("redirects with a readable code when the stored client secret cannot be decrypted", async () => {
    const google = okTokenFetch();
    const { app, database, cookie } = await readyApp({
      outboundFetch: google.fetchImpl,
    });
    const start = await requestStart(app, cookie);
    const state = stateFromLocation(start);
    // Simulate an encryption key change between /start and the callback:
    // the stored client secret blob no longer decrypts.
    database.sqlite.run(
      "UPDATE settings SET value = ? WHERE key = 'connection.google-calendar.oauthClientSecretEnc'",
      [Buffer.alloc(64, 7).toString("base64")],
    );

    const res = await requestCallback(
      app,
      `code=auth-code-1&state=${state}`,
      cookie,
    );

    // A readable settings banner, never a generic 500.
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "/settings/integrations?error=client_unreadable&connector=google-calendar",
    );
    expect(readConnections(database).length).toBe(0);
    expect(google.calls.length).toBe(0);
  });

  test("handles a token response without a refresh token", async () => {
    const google = okTokenFetch({ refresh_token: undefined });
    const { app, database, cookie } = await readyApp({
      outboundFetch: google.fetchImpl,
    });
    const start = await requestStart(app, cookie);
    const state = stateFromLocation(start);

    const res = await requestCallback(
      app,
      `code=auth-code-1&state=${state}`,
      cookie,
    );

    expect(res.headers.get("location")).toBe(
      "/settings/integrations?error=no_refresh_token&connector=google-calendar",
    );
    expect(readConnections(database).length).toBe(0);
  });

  test("redirects with an error when Google reports one", async () => {
    const { app, database, cookie } = await readyApp();

    const res = await requestCallback(app, "error=access_denied", cookie);

    expect(res.headers.get("location")).toBe(
      "/settings/integrations?error=provider_denied&connector=google-calendar",
    );
    expect(readConnections(database).length).toBe(0);
  });

  test("reconnect updates credentials but keeps the same connection row and refs", async () => {
    const google = googleFetchStub((call) =>
      Response.json(
        tokenPayload({
          access_token: `ya29.access-${call}`,
          refresh_token: `1//refresh-${call}`,
        }),
      ),
    );
    const { app, database, clock, key, cookie } = await readyApp({
      outboundFetch: google.fetchImpl,
    });

    const firstStart = await requestStart(app, cookie);
    await requestCallback(
      app,
      `code=code-1&state=${stateFromLocation(firstStart)}`,
      cookie,
    );
    const firstRow = onlyConnection(database);

    // A stretch of failed syncs followed by a dead refresh token, as the
    // scheduler and token refresh would leave them: reconnecting must
    // reset all of it so the next tick picks the connection up again.
    database.sqlite.run(
      "UPDATE connections SET status = 'reauth_required', consecutive_failures = 4, next_sync_at = ? WHERE id = ?",
      [clock.value + 999_999, firstRow.id],
    );

    // Synced data tied to the Google account, as 6b will create it.
    database.db
      .insert(entities)
      .values({
        id: "entity-1",
        kind: "calendar_event",
        schemaVersion: 1,
        source: "connector",
        createdAt: clock.value,
        updatedAt: clock.value,
      })
      .run();
    database.db
      .insert(externalRefs)
      .values({
        connectorId: "google-calendar",
        accountKey: "google-sub-1",
        externalId: "evt-1",
        entityId: "entity-1",
        lastSeenAt: clock.value,
      })
      .run();

    const secondStart = await requestStart(app, cookie);
    const res = await requestCallback(
      app,
      `code=code-2&state=${stateFromLocation(secondStart)}`,
      cookie,
    );
    expect(res.headers.get("location")).toBe(
      "/settings/integrations?connected=1",
    );

    const secondRow = onlyConnection(database);
    expect(secondRow.id).toBe(firstRow.id);
    expect(secondRow.status).toBe("active");
    // Reconnect resets the backoff state and makes the connection due
    // immediately, so syncing resumes without waiting out old failures.
    expect(secondRow.consecutive_failures).toBe(0);
    expect(secondRow.next_sync_at).toBe(clock.value);
    const credentials = JSON.parse(
      decryptCredentials(key, secondRow.credentials_enc),
    ) as Record<string, unknown>;
    expect(credentials.refreshToken).toBe("1//refresh-2");
    expect(credentials.accessToken).toBe("ya29.access-2");

    // Same Google sub: the account key is unchanged, so nothing is orphaned.
    expect(JSON.parse(secondRow.config)).toEqual({
      email: "person@example.com",
      accountKey: "google-sub-1",
    });
    const refs = database.sqlite
      .query<{ account_key: string; entity_id: string }, []>(
        "SELECT account_key, entity_id FROM external_refs",
      )
      .all();
    expect(refs).toEqual([
      { account_key: "google-sub-1", entity_id: "entity-1" },
    ]);
  });
});
