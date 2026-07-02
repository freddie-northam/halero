import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  makeTestApp,
  sessionCookieFrom,
  setupInput,
  type TestApp,
  trpcMutation,
} from "./test-utils";

describe("healthz", () => {
  test("responds 200 with status ok and no auth required", async () => {
    const { app } = makeTestApp();

    const res = await app.fetch(new Request("http://localhost/healthz"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("security headers", () => {
  test("are present on every response", async () => {
    const { app } = makeTestApp();

    for (const path of ["/healthz", "/", "/api/trpc/system.status"]) {
      const res = await app.fetch(new Request(`http://localhost${path}`));
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("same-origin");
    }
  });
});

describe("CSRF origin check", () => {
  test("rejects a mutation with a mismatched Origin", async () => {
    const { app } = makeTestApp();

    const res = await trpcMutation(app, "system.setup", setupInput, {
      origin: "https://evil.example.com",
    });

    expect(res.status).toBe(403);
    expect(await res.text()).toContain("only accepts changes from");
  });

  test("allows a mutation with a matching Origin", async () => {
    const { app } = makeTestApp();

    const res = await trpcMutation(app, "system.setup", setupInput, {
      origin: "http://localhost:4253",
    });

    expect(res.status).toBe(200);
  });

  test("allows a mutation without an Origin header", async () => {
    const { app } = makeTestApp();

    const res = await trpcMutation(app, "system.setup", setupInput);

    expect(res.status).toBe(200);
  });
});

describe("session cookie flags", () => {
  test("no Secure flag when the base URL is http", async () => {
    const { app } = makeTestApp();

    const res = await trpcMutation(app, "system.setup", setupInput);
    const cookie = res.headers.getSetCookie().join("; ");

    expect(cookie).toContain("halero_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure");
  });

  test("Secure flag present when the base URL is https", async () => {
    const { app } = makeTestApp({ baseUrl: "https://halero.example.com" });

    const res = await trpcMutation(app, "system.setup", setupInput);
    const cookie = res.headers.getSetCookie().join("; ");

    expect(cookie).toContain("halero_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(sessionCookieFrom(res)).toStartWith("halero_session=");
  });
});

describe("base URL authority", () => {
  // Setup stores base_url in settings while the env default stays
  // http://localhost:4253. Every consumer must follow the settings value.
  const setupWithDomain = async (): Promise<TestApp & { cookie: string }> => {
    const testApp = makeTestApp();
    const res = await trpcMutation(testApp.app, "system.setup", {
      ...setupInput,
      baseUrl: "https://halero.example.com",
    });
    return { ...testApp, cookie: sessionCookieFrom(res) };
  };

  test("CSRF allows the settings origin and rejects the stale env origin", async () => {
    const { app } = await setupWithDomain();

    const settingsOrigin = await trpcMutation(
      app,
      "auth.login",
      { password: setupInput.password },
      { origin: "https://halero.example.com" },
    );
    const envOrigin = await trpcMutation(
      app,
      "auth.login",
      { password: setupInput.password },
      { origin: "http://localhost:4253" },
    );

    expect(settingsOrigin.status).toBe(200);
    expect(envOrigin.status).toBe(403);
    expect(await envOrigin.text()).toContain("https://halero.example.com");
  });

  test("session cookies carry Secure when the settings base URL is https", async () => {
    const { app } = await setupWithDomain();

    const res = await trpcMutation(app, "auth.login", {
      password: setupInput.password,
    });

    expect(sessionCookieFrom(res)).toStartWith("halero_session=");
    expect(res.headers.getSetCookie().join("; ")).toContain("Secure");
  });

  test("OAuth redirect URI and CSRF origin derive from the same settings value", async () => {
    const { app, cookie } = await setupWithDomain();

    // The saveClient mutation passes CSRF against the settings origin...
    const saved = await trpcMutation(
      app,
      "connections.google.saveClient",
      { clientId: "id-1.apps.googleusercontent.com", clientSecret: "shh" },
      { cookie, origin: "https://halero.example.com" },
    );
    expect(saved.status).toBe(200);

    // ...and the start route builds its redirect URI from the same value.
    const start = await app.fetch(
      new Request("http://localhost/api/oauth/google/start", {
        headers: { cookie },
      }),
    );
    expect(start.status).toBe(302);
    const location = new URL(start.headers.get("location") ?? "");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://halero.example.com/api/oauth/google/callback",
    );
  });
});

describe("SPA serving", () => {
  const makeDist = (): string => {
    const distDir = mkdtempSync(join(tmpdir(), "halero-dist-"));
    writeFileSync(
      join(distDir, "index.html"),
      "<html><body>halero-spa-index</body></html>",
    );
    writeFileSync(join(distDir, "app.js"), "console.log('halero-asset');");
    return distDir;
  };

  test("serves a placeholder when the dist dir is missing", async () => {
    const { app } = makeTestApp();

    const res = await app.fetch(new Request("http://localhost/"));

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("web app is not built yet");
  });

  test("serves static assets from the dist dir", async () => {
    const { app } = makeTestApp({ webDistDir: makeDist() });

    const res = await app.fetch(new Request("http://localhost/app.js"));

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("halero-asset");
  });

  test("falls back to index.html for client-side routes", async () => {
    const { app } = makeTestApp({ webDistDir: makeDist() });

    for (const path of ["/", "/journal/2026-07-02", "/settings"]) {
      const res = await app.fetch(new Request(`http://localhost${path}`));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("halero-spa-index");
    }
  });

  test("does not fall back to index.html for unknown API paths", async () => {
    const { app } = makeTestApp({ webDistDir: makeDist() });

    const res = await app.fetch(new Request("http://localhost/api/nope"));

    expect(res.status).toBe(404);
  });

  test("does not serve files outside the dist dir", async () => {
    const { app } = makeTestApp({ webDistDir: makeDist() });

    const res = await app.fetch(
      new Request("http://localhost/%2e%2e/%2e%2e/etc/passwd"),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("halero-spa-index");
  });
});
