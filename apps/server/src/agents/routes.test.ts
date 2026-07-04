import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../middleware/session";
import { createAgentRoutes } from "./routes";

// The gate is proven through app.request (no live socket): a disabled or
// unconfigured instance never reaches the upgrade. The streaming path
// mirrors the terminal WS route, which is verified live end to end.

const mountedRequest = (
  developerTerminal: boolean,
  agentsRepo: string | null,
): ReturnType<Hono<AppEnv>["request"]> => {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("session", { id: "sess" } as never);
    await next();
  });
  app.route(
    "/api/agents",
    createAgentRoutes({
      config: {
        dataDir: "/tmp",
        port: 4253,
        baseUrl: new URL("http://localhost:4253"),
        developerTerminal,
        agentsRepo,
      },
      manager: null,
    }),
  );
  return app.request("/api/agents/ws?id=x");
};

describe("agent routes", () => {
  test("403s the ws endpoint when orchestration is disabled", async () => {
    const res = await mountedRequest(false, null);
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("not enabled");
  });

  test("403s when the terminal flag is on but no repo is configured", async () => {
    const res = await mountedRequest(true, null);
    expect(res.status).toBe(403);
  });
});
