import { describe, expect, test } from "bun:test";
import { SESSION_TTL_MS } from "../auth";
import {
  makeTestApp,
  type StatusData,
  sessionCookieFrom,
  setupInput,
  type TestApp,
  type TrpcSuccess,
  trpcMutation,
  trpcQuery,
} from "../test-utils";

const readStatus = async (
  app: TestApp["app"],
  cookie?: string,
): Promise<StatusData> => {
  const res = await trpcQuery(app, "system.status", { cookie });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<StatusData>;
  return json.result.data;
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

describe("system.status", () => {
  test("reports needsSetup on a fresh database", async () => {
    const { app } = makeTestApp();

    const status = await readStatus(app);

    expect(status).toEqual({ needsSetup: true, authenticated: false });
  });

  test("reports configured and authenticated after setup", async () => {
    const { app } = makeTestApp();

    const res = await trpcMutation(app, "system.setup", setupInput);
    const cookie = sessionCookieFrom(res);
    const status = await readStatus(app, cookie);

    expect(status).toEqual({ needsSetup: false, authenticated: true });
  });
});

describe("system.setup", () => {
  test("stores an argon2id hash, timezone, and setup flag", async () => {
    const { app, database } = makeTestApp();

    const res = await trpcMutation(app, "system.setup", setupInput);

    expect(res.status).toBe(200);
    expect(sessionCookieFrom(res)).toStartWith("halero_session=");
    expect(readSetting(database, "password_hash")).toStartWith("$argon2id$");
    expect(readSetting(database, "home_timezone")).toBe("Europe/London");
    expect(readSetting(database, "setup_complete")).toBe("1");
  });

  test("stores an optional base URL override", async () => {
    const { app, database } = makeTestApp();

    await trpcMutation(app, "system.setup", {
      ...setupInput,
      baseUrl: "https://halero.example.com",
    });

    expect(readSetting(database, "base_url")).toBe(
      "https://halero.example.com",
    );
  });

  test("rejects a second setup attempt with a readable error", async () => {
    const { app } = makeTestApp();
    await trpcMutation(app, "system.setup", setupInput);

    const res = await trpcMutation(app, "system.setup", setupInput);

    expect(res.status).toBe(403);
    expect(await res.text()).toContain("already been completed");
  });

  test("rejects a weak password", async () => {
    const { app } = makeTestApp();

    const res = await trpcMutation(app, "system.setup", {
      ...setupInput,
      password: "short",
    });

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("at least 8 characters");
  });

  test("rejects an invalid timezone", async () => {
    const { app } = makeTestApp();

    const res = await trpcMutation(app, "system.setup", {
      ...setupInput,
      homeTimezone: "Mars/Olympus_Mons",
    });

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("timezone");
  });
});

describe("auth.login", () => {
  const setUp = async (): Promise<TestApp> => {
    const testApp = makeTestApp();
    await trpcMutation(testApp.app, "system.setup", setupInput);
    return testApp;
  };

  test("sets a session cookie for the correct password", async () => {
    const { app } = await setUp();

    const res = await trpcMutation(app, "auth.login", {
      password: setupInput.password,
    });

    expect(res.status).toBe(200);
    expect(sessionCookieFrom(res)).toStartWith("halero_session=");
  });

  test("rejects a wrong password with a readable error", async () => {
    const { app } = await setUp();

    const res = await trpcMutation(app, "auth.login", {
      password: "nope-nope",
    });

    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Incorrect password");
  });

  test("rate limits the sixth rapid attempt even with the correct password", async () => {
    const { app } = await setUp();

    for (const _ of [1, 2, 3, 4, 5]) {
      const res = await trpcMutation(app, "auth.login", {
        password: "wrong-password",
      });
      expect(res.status).toBe(401);
    }
    const res = await trpcMutation(app, "auth.login", {
      password: setupInput.password,
    });

    expect(res.status).toBe(429);
    expect(await res.text()).toContain("Too many login attempts");
  });
});

describe("protected procedures", () => {
  test("reject requests without a session cookie", async () => {
    const { app } = makeTestApp();

    const res = await trpcMutation(app, "auth.logout", undefined);

    expect(res.status).toBe(401);
    expect(await res.text()).toContain("sign in");
  });

  test("work with a valid session cookie", async () => {
    const { app } = makeTestApp();
    const setupRes = await trpcMutation(app, "system.setup", setupInput);
    const cookie = sessionCookieFrom(setupRes);

    const res = await trpcMutation(app, "auth.logout", undefined, { cookie });

    expect(res.status).toBe(200);
    const cleared = res.headers.getSetCookie().join("; ");
    expect(cleared).toContain("halero_session=;");
    expect(cleared).toContain("Max-Age=0");
  });

  test("fail after logout destroys the session", async () => {
    const { app } = makeTestApp();
    const setupRes = await trpcMutation(app, "system.setup", setupInput);
    const cookie = sessionCookieFrom(setupRes);
    await trpcMutation(app, "auth.logout", undefined, { cookie });

    const res = await trpcMutation(app, "auth.logout", undefined, { cookie });

    expect(res.status).toBe(401);
    expect(await readStatus(app, cookie)).toEqual({
      needsSetup: false,
      authenticated: false,
    });
  });

  test("fail once the session has expired", async () => {
    const { app, clock } = makeTestApp();
    const setupRes = await trpcMutation(app, "system.setup", setupInput);
    const cookie = sessionCookieFrom(setupRes);

    clock.value += SESSION_TTL_MS + 1;
    const res = await trpcMutation(app, "auth.logout", undefined, { cookie });

    expect(res.status).toBe(401);
  });
});
