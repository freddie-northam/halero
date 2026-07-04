// Builds the app's single AgentRunManager, or null when agent
// orchestration is not enabled. Enabled needs both the developer opt-in
// (same flag as the terminal, since both are command execution) and a
// configured git repository for runs to branch from. Worktrees live under
// the data directory so they ride the same backups/lifecycle boundary.

import { join } from "node:path";
import type { HaleroConfig } from "../config";
import { AgentRunManager } from "./agent-run";
import { WorktreeManager } from "./worktree";

export const createAgentRunManager = (
  config: HaleroConfig,
  now: () => number,
): AgentRunManager | null => {
  if (!config.developerTerminal || config.agentsRepo === null) {
    return null;
  }
  const worktrees = new WorktreeManager({
    repoPath: config.agentsRepo,
    worktreesDir: join(config.dataDir, "agent-worktrees"),
  });
  // Runs branch from the repo's current HEAD.
  return new AgentRunManager({ worktrees, base: "HEAD", now });
};
