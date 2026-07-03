import { describe, expect, test } from "bun:test";
import { decryptCredentials, encryptCredentials } from "@halero/core";
import { connections, syncRuns } from "@halero/db";
import { eq } from "drizzle-orm";
import { saveOauthClient } from "../connections/oauth-client";
import {
  completeSetup,
  type MakeTestAppOptions,
  makeTestApp,
  type TestApp,
  type TrpcSuccess,
  trpcMutation,
  trpcQuery,
} from "../test-utils";

const GC = "google-calendar";
const CLIENT_ID_KEY = "connection.google-calendar.oauthClientId";
const CLIENT_SECRET_KEY = "connection.google-calendar.oauthClientSecretEnc";

const clientInput = {
  clientId: "1234-abc.apps.googleusercontent.com",
  clientSecret: "GOCSPX-super-secret-value",
};

const readSetting = (
  database: TestApp["database"],
  key: string,
): string | null =>
  database.sqlite
    .query<{ value: string }, [string]>(
      "SELECT value FROM settings WHERE key = ?",
    )
    .get(key)?.value ?? null;

interface OauthConfigData {
  readonly clientConfigured: boolean;
  readonly httpsOk: boolean;
  readonly redirectUri: string;
}

const readOauthConfig = async (
  app: TestApp["app"],
  cookie: string,
): Promise<OauthConfigData> => {
  const res = await trpcQuery(app, "connections.oauthConfig", {
    cookie,
    input: { connectorId: GC },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as TrpcSuccess<OauthConfigData>).result.data;
};

describe("connections.saveOauthClient", () => {
  test("rejects without a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);
    const res = await trpcMutation(app, "connections.saveOauthClient", {
      connectorId: GC,
      ...clientInput,
    });
    expect(res.status).toBe(401);
  });

  test("stores the client ID plainly and the secret encrypted", async () => {
    const { app, database, key } = makeTestApp();
    const cookie = await completeSetup(app);
    const res = await trpcMutation(
      app,
      "connections.saveOauthClient",
      { connectorId: GC, ...clientInput },
      { cookie },
    );
    expect(res.status).toBe(200);
    expect(readSetting(database, CLIENT_ID_KEY)).toBe(clientInput.clientId);
    const storedSecret = readSetting(database, CLIENT_SECRET_KEY);
    if (storedSecret === null) {
      throw new Error("expected the encrypted client secret to be stored");
    }
    expect(storedSecret).not.toContain(clientInput.clientSecret);
    const decrypted = decryptCredentials(
      key,
      Uint8Array.from(Buffer.from(storedSecret, "base64")),
    );
    expect(decrypted).toBe(clientInput.clientSecret);
  });

  test("rejects an empty client ID or secret with a readable error", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);
    const emptyId = await trpcMutation(
      app,
      "connections.saveOauthClient",
      { connectorId: GC, ...clientInput, clientId: "  " },
      { cookie },
    );
    expect(emptyId.status).toBe(400);
    expect(await emptyId.text()).toContain("client ID");
  });
});

describe("connections.oauthConfig", () => {
  test("reports unconfigured with https ok and the namespaced redirect URI", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);
    expect(await readOauthConfig(app, cookie)).toEqual({
      clientConfigured: false,
      httpsOk: true,
      redirectUri: "http://localhost:4253/api/oauth/google-calendar/callback",
    });
  });

  test("reports clientConfigured after saveOauthClient", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);
    await trpcMutation(
      app,
      "connections.saveOauthClient",
      { connectorId: GC, ...clientInput },
      { cookie },
    );
    expect((await readOauthConfig(app, cookie)).clientConfigured).toBe(true);
  });

  test("reports httpsOk false for a plain-http non-localhost base URL", async () => {
    const { app } = makeTestApp({ baseUrl: "http://halero.internal:8080" });
    const cookie = await completeSetup(app);
    const cfg = await readOauthConfig(app, cookie);
    expect(cfg.httpsOk).toBe(false);
    expect(cfg.redirectUri).toBe(
      "http://halero.internal:8080/api/oauth/google-calendar/callback",
    );
  });
});

interface CatalogItem {
  readonly id: string;
  readonly availability: string;
  readonly connection: { readonly accountLabel: string | null } | null;
}

const readCatalog = async (
  app: TestApp["app"],
  cookie: string,
): Promise<CatalogItem[]> => {
  const res = await trpcQuery(app, "connections.catalog", { cookie });
  expect(res.status).toBe(200);
  return ((await res.json()) as TrpcSuccess<CatalogItem[]>).result.data;
};

describe("connections.catalog", () => {
  test("lists live and coming-soon integrations with connection status", async () => {
    const testApp = makeTestApp();
    const { app, clock } = testApp;
    const cookie = await completeSetup(app);
    testApp.database.db
      .insert(connections)
      .values({
        id: "conn-status-1",
        connectorId: GC,
        displayName: "Google Calendar",
        config: JSON.stringify({
          email: "person@example.com",
          accountKey: "google-sub-1",
        }),
        status: "active",
        nextSyncAt: clock.value,
        createdAt: clock.value,
      })
      .run();

    const catalog = await readCatalog(app, cookie);
    const google = catalog.find((item) => item.id === GC);
    const github = catalog.find((item) => item.id === "github");
    const comingSoon = catalog.find(
      (item) => item.availability === "coming_soon",
    );

    expect(google?.connection?.accountLabel).toBe("person@example.com");
    expect(github?.connection).toBeNull();
    expect(comingSoon).toBeDefined();
    expect(comingSoon?.connection).toBeNull();
  });
});

const seedSyncableConnection = (testApp: TestApp, status = "active"): void => {
  const { database, key, clock } = testApp;
  saveOauthClient(database.db, key, GC, clientInput);
  database.db
    .insert(connections)
    .values({
      id: "conn-sync-1",
      connectorId: GC,
      displayName: "Google Calendar",
      config: JSON.stringify({
        email: "person@example.com",
        accountKey: "google-sub-1",
      }),
      credentialsEnc: Buffer.from(
        encryptCredentials(
          key,
          JSON.stringify({
            refreshToken: "1//refresh-a",
            accessToken: "ya29.valid",
            accessTokenExpiresAt: clock.value + 3_600_000,
          }),
        ),
      ),
      status,
      nextSyncAt: clock.value,
      createdAt: clock.value,
    })
    .run();
};

describe("connections.status", () => {
  test("lists the 5 most recent runs, newest first, with lastSuccessAt", async () => {
    const testApp = makeTestApp();
    const { app, database, clock } = testApp;
    const cookie = await completeSetup(app);
    seedSyncableConnection(testApp);
    for (let i = 1; i <= 7; i += 1) {
      database.db
        .insert(syncRuns)
        .values({
          id: `run-${i}`,
          connectionId: "conn-sync-1",
          startedAt: clock.value - (8 - i) * 60_000,
          finishedAt: clock.value - (8 - i) * 60_000 + 1_000,
          status: i === 6 ? "failed" : "success",
          upserts: i,
          deletes: 0,
          error: i === 6 ? "Halero could not reach Google Calendar." : null,
        })
        .run();
    }

    const res = await trpcQuery(app, "connections.status", {
      cookie,
      input: { connectorId: GC },
    });
    const data = (
      (await res.json()) as TrpcSuccess<{
        connection: {
          recentRuns: { upserts: number }[];
          lastSuccessAt: number | null;
        } | null;
      }>
    ).result.data;
    expect(data.connection?.recentRuns.map((r) => r.upserts)).toEqual([
      7, 6, 5, 4, 3,
    ]);
    expect(data.connection?.lastSuccessAt).toBe(clock.value - 60_000 + 1_000);
  });
});

interface SyncNowData {
  readonly status: string;
  readonly upserts: number;
  readonly deletes: number;
  readonly error: string | null;
}

const happyGoogleFetch: NonNullable<MakeTestAppOptions["outboundFetch"]> = (
  input,
) => {
  const url = new URL(String(input));
  if (url.pathname === "/calendar/v3/users/me/calendarList") {
    return Promise.resolve(
      Response.json({ items: [{ id: "primary", summary: "Personal" }] }),
    );
  }
  if (url.pathname === "/calendar/v3/calendars/primary/events") {
    return Promise.resolve(
      Response.json({
        items: [
          {
            id: "evt-1",
            etag: '"e1-v1"',
            status: "confirmed",
            summary: "Standup",
            start: { dateTime: "2025-07-02T09:30:00+01:00" },
            end: { dateTime: "2025-07-02T09:45:00+01:00" },
          },
        ],
        nextSyncToken: "sync-token-1",
      }),
    );
  }
  throw new Error(`unexpected Google call: ${url.toString()}`);
};

const syncNow = (
  app: TestApp["app"],
  opts?: { cookie?: string },
): Promise<Response> =>
  trpcMutation(app, "connections.syncNow", { connectorId: GC }, opts);

describe("connections.syncNow", () => {
  test("rejects without a session", async () => {
    const testApp = makeTestApp();
    await completeSetup(testApp.app);
    seedSyncableConnection(testApp);
    expect((await syncNow(testApp.app)).status).toBe(401);
  });

  test("rejects readably when no connection exists", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);
    const res = await syncNow(app, { cookie });
    expect(res.status).toBe(412);
    expect(await res.text()).toContain("Connect Google Calendar");
  });

  test("rejects readably when the connection needs a fresh sign-in", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedSyncableConnection(testApp, "reauth_required");
    const res = await syncNow(testApp.app, { cookie });
    expect(res.status).toBe(412);
    expect(await res.text()).toContain("fresh sign-in");
  });

  test("runs a sync and returns the run's counts", async () => {
    const testApp = makeTestApp({ outboundFetch: happyGoogleFetch });
    const cookie = await completeSetup(testApp.app);
    seedSyncableConnection(testApp);
    const res = await syncNow(testApp.app, { cookie });
    expect(res.status).toBe(200);
    const json = (await res.json()) as TrpcSuccess<SyncNowData>;
    expect(json.result.data).toEqual({
      status: "success",
      upserts: 1,
      deletes: 0,
      error: null,
    });
  });
});

const githubFetch =
  (login: string | null): NonNullable<MakeTestAppOptions["outboundFetch"]> =>
  (input) => {
    const url = new URL(String(input));
    if (url.host === "api.github.com") {
      return Promise.resolve(
        login === null
          ? Response.json({ message: "Bad credentials" }, { status: 401 })
          : Response.json({ data: { viewer: { login } } }),
      );
    }
    throw new Error(`unexpected call: ${url.toString()}`);
  };

describe("connections.connectApiKey + disconnect (GitHub)", () => {
  test("validates the token, stores it, and reports the account label", async () => {
    const testApp = makeTestApp({ outboundFetch: githubFetch("octocat") });
    const { app, database } = testApp;
    const cookie = await completeSetup(app);
    const res = await trpcMutation(
      app,
      "connections.connectApiKey",
      { connectorId: "github", token: "ghp_valid" },
      { cookie },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as TrpcSuccess<{ accountLabel: string }>;
    expect(json.result.data.accountLabel).toBe("octocat");
    const row = database.db
      .select()
      .from(connections)
      .where(eq(connections.connectorId, "github"))
      .get();
    expect(row?.credentialsEnc).not.toBeNull();

    const disc = await trpcMutation(
      app,
      "connections.disconnect",
      { connectorId: "github" },
      { cookie },
    );
    expect(disc.status).toBe(200);
    const after = database.db
      .select()
      .from(connections)
      .where(eq(connections.connectorId, "github"))
      .get();
    expect(after).toBeUndefined();
  });

  test("rejects an invalid token with a readable error", async () => {
    const testApp = makeTestApp({ outboundFetch: githubFetch(null) });
    const cookie = await completeSetup(testApp.app);
    const res = await trpcMutation(
      testApp.app,
      "connections.connectApiKey",
      { connectorId: "github", token: "ghp_bad" },
      { cookie },
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("read:user");
  });
});
