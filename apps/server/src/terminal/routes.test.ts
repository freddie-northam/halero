import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../middleware/session";
import { createTerminalRoutes } from "./routes";

// The route is exercised through app.request (no live Bun server), which
// is enough to prove the pre-upgrade gate: a disabled instance never
// reaches the upgrade. The happy path needs a real socket and is covered
// by the gate + manager + session unit tests plus manual smoke testing.

const mountedRequest = (
  developerTerminal: boolean,
): ReturnType<Hono<AppEnv>["request"]> => {
  const app = new Hono<AppEnv>();
  // The real app sets the session; default it to signed-in so the 403
  // we assert is the terminal gate, not the auth guard.
  app.use("*", async (c, next) => {
    c.set("session", { id: "sess" } as never);
    await next();
  });
  app.route(
    "/api/terminal",
    createTerminalRoutes({
      config: {
        dataDir: "/tmp",
        port: 4253,
        baseUrl: new URL("http://localhost:4253"),
        developerTerminal,
      },
      manager: null,
    }),
  );
  return app.request("/api/terminal/ws");
};

describe("terminal routes", () => {
  test("403s the ws endpoint when the terminal is disabled", async () => {
    const res = await mountedRequest(false);
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("not enabled");
  });
});
