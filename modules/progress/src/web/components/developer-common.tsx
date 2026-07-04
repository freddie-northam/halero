// Small pieces the Developer tabs share: the error alert, the connect
// prompts, the source filters, and the per-source colour ramps. Kept out
// of the tab files so the screen and its three tabs agree on them.

import { Alert, AlertDescription } from "@halero/ui";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import type { ProgressStatus, SourceStatus } from "../../contract";
import { readableError } from "../readable-error";

export const GITHUB_SOURCE_ID = "github";
export const DEVELOPER_CATEGORY = "developer";

// Per-source colour ramps (empty -> max). "all" (the merged dev view) and
// any source without its own ramp use the Halero brand ramp (coral).
const BRAND_RAMP = [
  "#f5f5f4",
  "#ffd0d1",
  "#ffa5a8",
  "#ff7a7e",
  "#ff5a5f",
] as const;
const RAMPS: Record<string, readonly string[]> = {
  all: BRAND_RAMP,
  github: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  "claude-code": ["#f5f5f4", "#f8cba6", "#f0a875", "#e0894a", "#c2410c"],
  codex: ["#f5f5f4", "#a7d8d0", "#5fb3a8", "#2f8f82", "#0f766e"],
};
export const rampFor = (source: string): readonly string[] =>
  RAMPS[source] ?? BRAND_RAMP;

export const connectedSourcesOf = (
  status: ProgressStatus | undefined,
): readonly SourceStatus[] =>
  status === undefined ? [] : status.sources.filter((s) => s.connected);

export const developerSourcesOf = (
  status: ProgressStatus | undefined,
): readonly SourceStatus[] =>
  connectedSourcesOf(status).filter((s) => s.category === DEVELOPER_CATEGORY);

export const isGithubConnected = (
  status: ProgressStatus | undefined,
): boolean => connectedSourcesOf(status).some((s) => s.id === GITHUB_SOURCE_ID);

export const ErrorAlert = ({
  error,
}: {
  readonly error: unknown;
}): ReactElement => (
  <Alert variant="destructive">
    <AlertDescription>{readableError(error)}</AlertDescription>
  </Alert>
);

const IntegrationsLink = (): ReactElement => (
  <Link
    to="/settings/$section"
    params={{ section: "integrations" }}
    className="font-medium underline underline-offset-4 hover:text-foreground"
  >
    Open integrations
  </Link>
);

export const GithubConnectPrompt = (): ReactElement => (
  <div className="rounded-lg border border-dashed p-8 text-center">
    <h2 className="text-base font-semibold">Connect GitHub</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Connect GitHub to see the pull requests waiting on you, your open PRs, and
      your assigned issues. <IntegrationsLink />
    </p>
  </div>
);

export const ActivityConnectPrompt = (): ReactElement => (
  <div className="rounded-lg border border-dashed p-8 text-center">
    <h2 className="text-base font-semibold">Connect a developer source</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Connect GitHub, Claude Code, or Codex to build your activity heatmap.{" "}
      <IntegrationsLink />
    </p>
  </div>
);
