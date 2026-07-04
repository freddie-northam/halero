import { describe, expect, test } from "bun:test";
import { AGENT_DEFINITIONS, buildRunSpecs, getAgent } from "./registry";

describe("agent registry", () => {
  test("ships the known agent CLIs", () => {
    const ids = AGENT_DEFINITIONS.map((agent) => agent.id);
    expect(ids).toContain("claude");
    expect(ids).toContain("codex");
    expect(getAgent("claude")?.command).toBe("claude");
  });

  test("fans a prompt out into one run spec per selected agent", () => {
    const specs = buildRunSpecs("fix the bug", ["claude", "codex"]);
    expect(specs).toEqual([
      { agentId: "claude", command: "claude", args: ["-p", "fix the bug"] },
      { agentId: "codex", command: "codex", args: ["exec", "fix the bug"] },
    ]);
  });

  test("rejects an unknown agent, naming it", () => {
    expect(() => buildRunSpecs("x", ["ghost"])).toThrow(/ghost/);
  });

  test("requires at least one agent and a non-empty prompt", () => {
    expect(() => buildRunSpecs("x", [])).toThrow(/at least one/i);
    expect(() => buildRunSpecs("   ", ["claude"])).toThrow(/prompt/i);
  });
});
