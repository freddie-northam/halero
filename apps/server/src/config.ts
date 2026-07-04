import { z } from "zod";

export interface HaleroConfig {
  readonly dataDir: string;
  readonly port: number;
  readonly baseUrl: URL;
  /**
   * Opt-in for the Developer terminal (arbitrary command execution over a
   * PTY). Off by default; even when on, the route only serves loopback
   * requests. Never enable on a network-exposed instance.
   */
  readonly developerTerminal: boolean;
  /**
   * Absolute path to the git repository agent runs operate on, or null
   * when unset. Agent orchestration is available only when this is set
   * AND developerTerminal is on. Runs branch from the repo's HEAD in
   * isolated worktrees; the user's working tree is never touched.
   */
  readonly agentsRepo: string | null;
}

/**
 * Base URLs must be http(s): anything else (including "localhost:4253",
 * which parses with the scheme "localhost:") has an origin of "null",
 * and a null allowed origin would wave through sandboxed-iframe
 * requests whose Origin header is also "null".
 */
export const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const envSchema = z.object({
  HALERO_DATA_DIR: z
    .string()
    .min(1, "HALERO_DATA_DIR must not be empty.")
    .default("./data"),
  HALERO_PORT: z
    .string()
    .regex(/^\d+$/, "HALERO_PORT must be a whole number, like 4253.")
    .transform((value) => Number.parseInt(value, 10))
    .refine(
      (port) => port >= 1 && port <= 65535,
      "HALERO_PORT must be between 1 and 65535.",
    )
    .default(4253),
  HALERO_BASE_URL: z
    .string()
    .refine(
      isHttpUrl,
      "HALERO_BASE_URL must be a full URL starting with http:// or " +
        'https://, like "https://halero.example.com".',
    )
    .optional(),
  // Deliberately strict: only the exact strings "1" or "true" opt in, so
  // a stray value never silently exposes command execution.
  HALERO_DEVELOPER_TERMINAL: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((value) => value === "1" || value === "true"),
  HALERO_AGENTS_REPO: z.string().min(1).optional(),
});

export const loadConfig = (
  env: Record<string, string | undefined>,
): HaleroConfig => {
  const parsed = envSchema.safeParse({
    HALERO_DATA_DIR: env.HALERO_DATA_DIR,
    HALERO_PORT: env.HALERO_PORT,
    HALERO_BASE_URL: env.HALERO_BASE_URL,
    HALERO_DEVELOPER_TERMINAL: env.HALERO_DEVELOPER_TERMINAL,
    HALERO_AGENTS_REPO: env.HALERO_AGENTS_REPO,
  });
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join(" ");
    throw new Error(
      `Halero could not start because its configuration is invalid: ${details}`,
    );
  }
  const { HALERO_DATA_DIR, HALERO_PORT, HALERO_BASE_URL } = parsed.data;
  const baseUrl = new URL(HALERO_BASE_URL ?? `http://localhost:${HALERO_PORT}`);
  return {
    dataDir: HALERO_DATA_DIR,
    port: HALERO_PORT,
    baseUrl,
    developerTerminal: parsed.data.HALERO_DEVELOPER_TERMINAL,
    agentsRepo: parsed.data.HALERO_AGENTS_REPO ?? null,
  };
};
