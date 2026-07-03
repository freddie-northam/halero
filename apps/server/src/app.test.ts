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
    // The full report shape (degraded causes, tick staleness) is
    // covered in healthz.test.ts.
    expect(await res.json()).toEqual({
      status: "ok",
      lastTickAt: null,
      connections: [],
    });
  });
});

describe("security headers", () => {
  // Pinned on purpose: loosening the policy must show up as a failing
  // test, with the observed violation recorded next to the relaxation.
  // style-src carries 'unsafe-inline' because Radix and cmdk apply inline
  // styles the browser blocks otherwise (focus outlines, dialog scroll-lock,
  // runtime positioning). script-src stays strict 'self'. See the rationale
  // in middleware/security-headers.ts.
  const EXPECTED_CSP =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; font-src 'self'; connect-src 'self'; " +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

  test("are present on every response, including the SPA and API", async () => {
    const { app } = makeTestApp();

    for (const path of ["/healthz", "/", "/api/trpc/system.status"]) {
      const res = await app.fetch(new Request(`http://localhost${path}`));
      expect(res.headers.get("content-security-policy")).toBe(EXPECTED_CSP);
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

  test("changing the base URL from Settings moves CSRF origin and redirect URI immediately", async () => {
    const { app, cookie } = await setupWithDomain();
    const saved = await trpcMutation(
      app,
      "connections.google.saveClient",
      { clientId: "id-1.apps.googleusercontent.com", clientSecret: "shh" },
      { cookie, origin: "https://halero.example.com" },
    );
    expect(saved.status).toBe(200);

    const changed = await trpcMutation(
      app,
      "system.setBaseUrl",
      { baseUrl: "https://moved.example.com" },
      { cookie, origin: "https://halero.example.com" },
    );
    expect(changed.status).toBe(200);

    // The very next requests already follow the new single authority:
    // CSRF only accepts the new origin...
    const oldOrigin = await trpcMutation(
      app,
      "auth.login",
      { password: setupInput.password },
      { origin: "https://halero.example.com" },
    );
    const newOrigin = await trpcMutation(
      app,
      "auth.login",
      { password: setupInput.password },
      { origin: "https://moved.example.com" },
    );
    expect(oldOrigin.status).toBe(403);
    expect(newOrigin.status).toBe(200);

    // ...and the OAuth redirect URI is built from the same value.
    const start = await app.fetch(
      new Request("http://localhost/api/oauth/google/start", {
        headers: { cookie },
      }),
    );
    expect(start.status).toBe(302);
    const location = new URL(start.headers.get("location") ?? "");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://moved.example.com/api/oauth/google/callback",
    );
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
