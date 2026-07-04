// The agent CLIs Halero knows how to run, and the fan-out that turns one
// task (a prompt plus the agents to try) into one run spec per agent.
// Each definition owns how its CLI takes a prompt non-interactively, so
// the run layer stays CLI-agnostic. Add an agent by adding a definition.

export interface AgentDefinition {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  /** Builds the CLI argv that runs the prompt to completion, headless. */
  readonly buildArgs: (prompt: string) => readonly string[];
}

export const AGENT_DEFINITIONS: readonly AgentDefinition[] = [
  {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    buildArgs: (prompt) => ["-p", prompt],
  },
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    buildArgs: (prompt) => ["exec", prompt],
  },
];

const BY_ID = new Map(AGENT_DEFINITIONS.map((agent) => [agent.id, agent]));

export const getAgent = (id: string): AgentDefinition | undefined =>
  BY_ID.get(id);

export interface RunSpec {
  readonly agentId: string;
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * Fans a task out: one run spec per selected agent. Throws readably on an
 * empty prompt, no agents, or an unknown agent, so the caller surfaces a
 * message rather than starting a broken run.
 */
export const buildRunSpecs = (
  prompt: string,
  agentIds: readonly string[],
): RunSpec[] => {
  if (prompt.trim().length === 0) {
    throw new Error("A run needs a prompt.");
  }
  if (agentIds.length === 0) {
    throw new Error("Pick at least one agent to run.");
  }
  return agentIds.map((id) => {
    const agent = getAgent(id);
    if (agent === undefined) {
      throw new Error(`"${id}" is not a known agent.`);
    }
    return {
      agentId: id,
      command: agent.command,
      args: agent.buildArgs(prompt),
    };
  });
};
