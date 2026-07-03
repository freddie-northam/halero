// The activity-source registry: the ONE place the build names its Progress
// sources. The router iterates this; adding a source is a file here plus a
// catalog entry, nothing else.

import type { ActivitySource } from "../source";
import { claudeCodeSource } from "./claude-code";
import { codexSource } from "./codex";
import { githubSource } from "./github";
import { wisprFlowSource } from "./wispr-flow";

export { CLAUDE_CODE_SOURCE_ID } from "./claude-code";
export { CODEX_SOURCE_ID } from "./codex";
export { GITHUB_SOURCE_ID } from "./github";
export { WISPR_FLOW_SOURCE_ID } from "./wispr-flow";

export const ACTIVITY_SOURCES: readonly ActivitySource[] = [
  githubSource,
  claudeCodeSource,
  codexSource,
  wisprFlowSource,
];

export const getActivitySource = (id: string): ActivitySource | undefined =>
  ACTIVITY_SOURCES.find((source) => source.id === id);
