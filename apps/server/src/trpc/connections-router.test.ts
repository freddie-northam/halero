import { describe, expect, test } from "bun:test";
import { decryptCredentials, encryptCredentials } from "@halero/core";
import { connections, syncRuns } from "@halero/db";
import { eq } from "drizzle-orm";
import { saveGoogleClient } from "../sync/client-config";
import {
  completeSetup,
  type MakeTestAppOptions,
  makeTestApp,
  type TestApp,
  type TrpcSuccess,
  trpcMutation,
  trpcQuery,
} from "../test-utils";

const clientInput = {
  clientId: "1234-abc.apps.googleusercontent.com",
  clientSecret: "GOCSPX-super-secret-value",
};

interface LastRunData {
  readonly startedAt: number;
  readonly finishedAt: number | null;
  readonly status: string;
  readonly upserts: number;
  readonly deletes: number;
  readonly error: string | null;
}

interface GoogleStatusData {
  readonly clientConfigured: boolean;
  readonly httpsOk: boolean;
  readonly redirectUri: string;
  readonly connection: {
    readonly id: string;
    readonly status: string;
    readonly email: string | null;
    readonly lastError: string | null;
    readonly nextSyncAt: number | null;
    readonly consecutiveFailures: number;
    readonly lastRun: LastRunData | null;
    readonly lastSuccessAt: number | null;
  } | null;
}

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

const readGoogleStatus = async (
  app: TestApp["app"],
  cookie: string,
): Promise<GoogleStatusData> => {
  const res = await trpcQuery(app, "connections.google.status", { cookie });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<GoogleStatusData>;
  return json.result.data;
};

describe("connections.google.saveClient", () => {
  test("rejects without a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);

    const res = await trpcMutation(
      app,
      "connections.google.saveClient",
      clientInput,
    );

    expect(res.status).toBe(401);
  });

  test("stores the client ID plainly and the secret encrypted", async () => {
    const { app, database, key } = makeTestApp();
    const cookie = await completeSetup(app);

    const res = await trpcMutation(
      app,
      "connections.google.saveClient",
      clientInput,
      { cookie },
    );

    expect(res.status).toBe(200);
    expect(readSetting(database, "google_oauth_client_id")).toBe(
      clientInput.clientId,
    );
    const storedSecret = readSetting(
      database,
      "google_oauth_client_secret_enc",
    );
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
      "connections.google.saveClient",
      { ...clientInput, clientId: "  " },
      { cookie },
    );
    const emptySecret = await trpcMutation(
      app,
      "connections.google.saveClient",
      { ...clientInput, clientSecret: "" },
      { cookie },
    );

    expect(emptyId.status).toBe(400);
    expect(await emptyId.text()).toContain("client ID");
    expect(emptySecret.status).toBe(400);
    expect(await emptySecret.text()).toContain("client secret");
  });
});

describe("connections.google.status", () => {
  test("rejects without a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);

    const res = await trpcQuery(app, "connections.google.status");

    expect(res.status).toBe(401);
  });

  test("reports unconfigured with https ok on the localhost default", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);

    const status = await readGoogleStatus(app, cookie);

    expect(status).toEqual({
      clientConfigured: false,
      httpsOk: true,
      redirectUri: "http://localhost:4253/api/oauth/google/callback",
      connection: null,
    });
  });

  test("reports clientConfigured after saveClient", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);
    await trpcMutation(app, "connections.google.saveClient", clientInput, {
      cookie,
    });

    const status = await readGoogleStatus(app, cookie);

    expect(status.clientConfigured).toBe(true);
  });

  test("reports httpsOk false for a plain-http non-localhost base URL", async () => {
    const { app } = makeTestApp({ baseUrl: "http://halero.internal:8080" });
    const cookie = await completeSetup(app);

    const status = await readGoogleStatus(app, cookie);

    expect(status.httpsOk).toBe(false);
    expect(status.redirectUri).toBe(
      "http://halero.internal:8080/api/oauth/google/callback",
    );
  });

  test("reports httpsOk true for an https base URL", async () => {
    const { app } = makeTestApp({ baseUrl: "https://halero.example.com" });
    const cookie = await completeSetup(app);

    const status = await readGoogleStatus(app, cookie);

    expect(status.httpsOk).toBe(true);
    expect(status.redirectUri).toBe(
      "https://halero.example.com/api/oauth/google/callback",
    );
  });

  test("includes the connection with its email once one exists", async () => {
    const { app, database, clock } = makeTestApp();
    const cookie = await completeSetup(app);
    database.db
      .insert(connections)
      .values({
        id: "conn-status-1",
        connectorId: "google-calendar",
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

    const status = await readGoogleStatus(app, cookie);

    expect(status.connection).toEqual({
      id: "conn-status-1",
      status: "active",
      email: "person@example.com",
      lastError: null,
      nextSyncAt: clock.value,
      consecutiveFailures: 0,
      lastRun: null,
      lastSuccessAt: null,
    });
  });

  test("reports scheduling health and the latest run once runs exist", async () => {
    const testApp = makeTestApp();
    const { app, database, clock } = testApp;
    const cookie = await completeSetup(app);
    seedSyncableConnection(testApp);
    database.db
      .update(connections)
      .set({ consecutiveFailures: 2, nextSyncAt: clock.value + 120_000 })
      .where(eq(connections.id, "conn-sync-1"))
      .run();
    database.db
      .insert(syncRuns)
      .values({
        id: "run-1",
        connectionId: "conn-sync-1",
        startedAt: clock.value - 600_000,
        finishedAt: clock.value - 590_000,
        status: "success",
        upserts: 3,
        deletes: 1,
      })
      .run();
    database.db
      .insert(syncRuns)
      .values({
        id: "run-2",
        connectionId: "conn-sync-1",
        startedAt: clock.value - 300_000,
        finishedAt: clock.value - 299_000,
        status: "failed",
        error: "Halero could not reach Google Calendar.",
      })
      .run();

    const status = await readGoogleStatus(app, cookie);

    expect(status.connection?.nextSyncAt).toBe(clock.value + 120_000);
    expect(status.connection?.consecutiveFailures).toBe(2);
    expect(status.connection?.lastRun).toEqual({
      startedAt: clock.value - 300_000,
      finishedAt: clock.value - 299_000,
      status: "failed",
      upserts: 0,
      deletes: 0,
      error: "Halero could not reach Google Calendar.",
    });
    // The most recent successful run, not the most recent run.
    expect(status.connection?.lastSuccessAt).toBe(clock.value - 590_000);
  });
});

interface SyncNowData {
  readonly status: string;
  readonly upserts: number;
  readonly deletes: number;
  readonly error: string | null;
}

const seedSyncableConnection = (testApp: TestApp, status = "active"): void => {
  const { database, key, clock } = testApp;
  saveGoogleClient(database.db, key, clientInput);
  database.db
    .insert(connections)
    .values({
      id: "conn-sync-1",
      connectorId: "google-calendar",
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

describe("connections.google.syncNow", () => {
  test("rejects without a session", async () => {
    const testApp = makeTestApp();
    await completeSetup(testApp.app);
    seedSyncableConnection(testApp);

    const res = await trpcMutation(
      testApp.app,
      "connections.google.syncNow",
      {},
    );

    expect(res.status).toBe(401);
  });

  test("rejects readably when no connection exists", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);

    const res = await trpcMutation(
      app,
      "connections.google.syncNow",
      {},
      { cookie },
    );

    expect(res.status).toBe(412);
    expect(await res.text()).toContain("Connect Google Calendar");
  });

  test("rejects readably when the connection needs a fresh sign-in", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedSyncableConnection(testApp, "reauth_required");

    const res = await trpcMutation(
      testApp.app,
      "connections.google.syncNow",
      {},
      { cookie },
    );

    expect(res.status).toBe(412);
    expect(await res.text()).toContain("econnect");
  });

  test("runs a sync and returns the run's counts", async () => {
    const testApp = makeTestApp({ outboundFetch: happyGoogleFetch });
    const cookie = await completeSetup(testApp.app);
    seedSyncableConnection(testApp);

    const res = await trpcMutation(
      testApp.app,
      "connections.google.syncNow",
      {},
      { cookie },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as TrpcSuccess<SyncNowData>;
    expect(json.result.data).toEqual({
      status: "success",
      upserts: 1,
      deletes: 0,
      error: null,
    });
  });

  test("rejects readably while a sync is already running", async () => {
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    let signalStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const gatedFetch: NonNullable<MakeTestAppOptions["outboundFetch"]> = async (
      input,
      init,
    ) => {
      signalStarted();
      await gate;
      return happyGoogleFetch(input, init);
    };
    const testApp = makeTestApp({ outboundFetch: gatedFetch });
    const cookie = await completeSetup(testApp.app);
    seedSyncableConnection(testApp);

    const first = trpcMutation(
      testApp.app,
      "connections.google.syncNow",
      {},
      { cookie },
    );
    // Only proceed once the first run is provably in flight.
    await started;
    const second = await trpcMutation(
      testApp.app,
      "connections.google.syncNow",
      {},
      { cookie },
    );

    expect(second.status).toBe(412);
    expect(await second.text()).toContain("already running");

    releaseGate();
    const firstRes = await first;
    expect(firstRes.status).toBe(200);
    const firstJson = (await firstRes.json()) as TrpcSuccess<SyncNowData>;
    expect(firstJson.result.data.status).toBe("success");
  });
});
