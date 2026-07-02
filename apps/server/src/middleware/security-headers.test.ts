import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createSecureErrorHandler, securityHeaders } from "./security-headers";

const expectSecurityHeaders = (res: Response): void => {
  expect(res.headers.get("content-security-policy")).toContain(
    "default-src 'self'",
  );
  expect(res.headers.get("content-security-policy")).toContain(
    "frame-ancestors 'none'",
  );
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  expect(res.headers.get("referrer-policy")).toBe("same-origin");
};

const makeApp = (): Hono => {
  const app = new Hono();
  app.use("*", securityHeaders);
  app.onError(createSecureErrorHandler(() => {}));
  app.get("/ok", (c) => c.text("fine"));
  app.get("/boom", () => {
    throw new Error("secret internal detail");
  });
  app.get("/teapot", () => {
    throw new HTTPException(418, { message: "short and stout" });
  });
  return app;
};

describe("securityHeaders", () => {
  test("sets the security headers on normal responses", async () => {
    const res = await makeApp().fetch(new Request("http://localhost/ok"));

    expect(res.status).toBe(200);
    expectSecurityHeaders(res);
  });
});

describe("createSecureErrorHandler", () => {
  test("a thrown error becomes a readable 500 that keeps the security headers", async () => {
    const res = await makeApp().fetch(new Request("http://localhost/boom"));

    expect(res.status).toBe(500);
    expectSecurityHeaders(res);
    const body = await res.text();
    expect(body).toContain("went wrong");
    // Internal error detail never leaks to the client.
    expect(body).not.toContain("secret internal detail");
  });

  test("an HTTPException keeps its own status and gains the headers", async () => {
    const res = await makeApp().fetch(new Request("http://localhost/teapot"));

    expect(res.status).toBe(418);
    expectSecurityHeaders(res);
  });

  test("logs the thrown error for the operator", async () => {
    const logged: unknown[] = [];
    const app = new Hono();
    app.use("*", securityHeaders);
    app.onError(createSecureErrorHandler((error) => logged.push(error)));
    app.get("/boom", () => {
      throw new Error("secret internal detail");
    });

    await app.fetch(new Request("http://localhost/boom"));

    expect(logged).toHaveLength(1);
    expect(logged[0]).toBeInstanceOf(Error);
  });
});
