import { describe, expect, test } from "bun:test";
import { getSetting } from "../settings";
import {
  completeSetup,
  makeTestApp,
  type TrpcSuccess,
  trpcMutation,
  trpcQuery,
} from "../test-utils";

interface SettingsData {
  readonly url: string | null;
}

interface SendTestData {
  readonly delivered: boolean;
}

describe("notifications.settings", () => {
  test("rejects without a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);

    const res = await trpcQuery(app, "notifications.settings");

    expect(res.status).toBe(401);
  });

  test("returns null before a URL is saved", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);

    const res = await trpcQuery(app, "notifications.settings", { cookie });

    expect(res.status).toBe(200);
    const json = (await res.json()) as TrpcSuccess<SettingsData>;
    expect(json.result.data).toEqual({ url: null });
  });
});

describe("notifications.save", () => {
  test("rejects without a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);

    const res = await trpcMutation(app, "notifications.save", {
      url: "https://ntfy.sh/halero",
    });

    expect(res.status).toBe(401);
  });

  test("stores the URL and returns it from settings", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const saved = await trpcMutation(
      testApp.app,
      "notifications.save",
      { url: "  https://ntfy.sh/halero  " },
      { cookie },
    );
    expect(saved.status).toBe(200);

    const res = await trpcQuery(testApp.app, "notifications.settings", {
      cookie,
    });
    const json = (await res.json()) as TrpcSuccess<SettingsData>;
    expect(json.result.data).toEqual({ url: "https://ntfy.sh/halero" });
  });

  test("an empty URL turns notifications off", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    await trpcMutation(
      testApp.app,
      "notifications.save",
      { url: "https://ntfy.sh/halero" },
      { cookie },
    );

    const cleared = await trpcMutation(
      testApp.app,
      "notifications.save",
      { url: "" },
      { cookie },
    );

    expect(cleared.status).toBe(200);
    expect(getSetting(testApp.database.db, "notify_url")).toBeNull();
  });

  test("rejects a non-URL readably", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);

    const res = await trpcMutation(
      app,
      "notifications.save",
      { url: "not a url" },
      { cookie },
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("full http(s) URL");
  });
});

describe("notifications.sendTest", () => {
  test("rejects without a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);

    const res = await trpcMutation(app, "notifications.sendTest", {});

    expect(res.status).toBe(401);
  });

  test("rejects readably before a URL is saved", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);

    const res = await trpcMutation(
      app,
      "notifications.sendTest",
      {},
      { cookie },
    );

    expect(res.status).toBe(412);
    expect(await res.text()).toContain("notification URL");
  });

  test("posts a test payload to the saved URL", async () => {
    const posts: { url: string; body: string }[] = [];
    const testApp = makeTestApp({
      notifyFetch: (input, init) => {
        posts.push({ url: String(input), body: String(init?.body) });
        return Promise.resolve(new Response("ok", { status: 200 }));
      },
    });
    const cookie = await completeSetup(testApp.app);
    await trpcMutation(
      testApp.app,
      "notifications.save",
      { url: "https://ntfy.sh/halero" },
      { cookie },
    );

    const res = await trpcMutation(
      testApp.app,
      "notifications.sendTest",
      {},
      { cookie },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as TrpcSuccess<SendTestData>;
    expect(json.result.data.delivered).toBe(true);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.url).toBe("https://ntfy.sh/halero");
    const payload = JSON.parse(posts[0]?.body ?? "{}") as Record<
      string,
      unknown
    >;
    expect(payload.title).toContain("test");
    expect(typeof payload.message).toBe("string");
  });

  test("reports delivery failure without throwing", async () => {
    const testApp = makeTestApp({
      notifyFetch: () => Promise.reject(new Error("connect ECONNREFUSED")),
    });
    const cookie = await completeSetup(testApp.app);
    await trpcMutation(
      testApp.app,
      "notifications.save",
      { url: "https://ntfy.sh/halero" },
      { cookie },
    );

    const res = await trpcMutation(
      testApp.app,
      "notifications.sendTest",
      {},
      { cookie },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as TrpcSuccess<SendTestData>;
    expect(json.result.data.delivered).toBe(false);
  });
});
