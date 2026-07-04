import { describe, expect, test } from "bun:test";
import {
  completeSetup,
  makeTestApp,
  type TrpcSuccess,
  trpcMutation,
  trpcQuery,
} from "../test-utils";

interface Catalog {
  readonly enabled: boolean;
  readonly agents: readonly { readonly id: string; readonly label: string }[];
}

describe("agents router", () => {
  test("catalog reports the agents and that orchestration is off by default", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);
    const res = await trpcQuery(app, "agents.catalog", { cookie });
    expect(res.status).toBe(200);
    const json = (await res.json()) as TrpcSuccess<Catalog>;
    expect(json.result.data.enabled).toBe(false);
    expect(json.result.data.agents.map((a) => a.id)).toContain("claude");
  });

  test("start fails precondition when orchestration is disabled", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);
    const res = await trpcMutation(
      app,
      "agents.start",
      { prompt: "fix it", agentIds: ["claude"] },
      { cookie },
    );
    expect(res.status).not.toBe(200);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toContain("not enabled");
  });

  test("agents endpoints require a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);
    const res = await trpcQuery(app, "agents.catalog");
    expect(res.status).toBe(401);
  });
});
