// The Developer agent-orchestration API: start a task (a prompt fanned
// out to one run per selected agent), list runs, read a run's output and
// diff, and remove a run. The AgentRunManager is a per-app singleton on
// the context, non-null only when agents are enabled
// (HALERO_DEVELOPER_TERMINAL + HALERO_AGENTS_REPO); when null every
// mutating call fails precondition. Every procedure is authenticated.
// Agent runs are arbitrary command execution by design.

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { AgentRunManager } from "../agents/agent-run";
import { AGENT_DEFINITIONS, buildRunSpecs } from "../agents/registry";
import { protectedProcedure, router } from "./init";

const startInput = z.object({
  prompt: z.string().min(1),
  agentIds: z.array(z.string().min(1)).min(1),
});
const idInput = z.object({ id: z.string().min(1) });

const DISABLED_MESSAGE =
  "Agent orchestration is not enabled. Set HALERO_DEVELOPER_TERMINAL=1 and " +
  "HALERO_AGENTS_REPO to a git repository.";

const requireManager = (manager: AgentRunManager | null): AgentRunManager => {
  if (manager === null) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: DISABLED_MESSAGE,
    });
  }
  return manager;
};

export const agentsRouter = router({
  catalog: protectedProcedure.query(({ ctx }) => ({
    enabled: ctx.agents !== null,
    agents: AGENT_DEFINITIONS.map((agent) => ({
      id: agent.id,
      label: agent.label,
    })),
  })),

  start: protectedProcedure
    .input(startInput)
    .mutation(async ({ ctx, input }) => {
      const manager = requireManager(ctx.agents);
      let specs: ReturnType<typeof buildRunSpecs>;
      try {
        specs = buildRunSpecs(input.prompt, input.agentIds);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Invalid run.",
        });
      }
      const runs = [];
      for (const spec of specs) {
        const run = await manager.start({
          label: spec.agentId,
          command: spec.command,
          args: spec.args,
        });
        runs.push(run.info());
      }
      return { runs };
    }),

  list: protectedProcedure.query(({ ctx }) => ({
    enabled: ctx.agents !== null,
    runs: ctx.agents?.list() ?? [],
  })),

  get: protectedProcedure.input(idInput).query(({ ctx, input }) => {
    const run = ctx.agents?.get(input.id);
    if (run === undefined) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "That run could not be found.",
      });
    }
    const result = run.result();
    return {
      id: run.id,
      label: run.label,
      branch: run.branch,
      status: run.status,
      exitCode: run.exitCode,
      output: run.output(),
      diff: result?.diff ?? null,
    };
  }),

  remove: protectedProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    await requireManager(ctx.agents).remove(input.id);
    return { ok: true };
  }),
});
