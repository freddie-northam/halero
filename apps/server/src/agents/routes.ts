// The per-run terminal WebSocket: stream a live agent run's output to the
// browser and forward input to it, so you can watch (and, if the agent
// prompts, answer) a run as it works. Reuses the terminal's gate and JSON
// protocol. Unlike the terminal, closing the socket does NOT end the run:
// the run keeps going in its worktree and the client can reconnect; the
// run's scrollback is replayed on connect. Removal is explicit (the API).

import { Hono } from "hono";
import { getConnInfo, upgradeWebSocket } from "hono/bun";
import type { HaleroConfig } from "../config";
import type { AppEnv } from "../middleware/session";
import { isLoopbackAddress } from "../terminal/gate";
import {
  parseClientMessage,
  serverDataFrame,
  serverExitFrame,
} from "../terminal/protocol";
import type { AgentRunManager } from "./agent-run";

export interface AgentRoutesDeps {
  readonly config: HaleroConfig;
  /** Null when agent orchestration is disabled; the guard 403s first. */
  readonly manager: AgentRunManager | null;
}

const remoteAddress = (c: Parameters<typeof getConnInfo>[0]): string | null => {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
};

export const createAgentRoutes = (deps: AgentRoutesDeps): Hono<AppEnv> => {
  const { config, manager } = deps;
  const app = new Hono<AppEnv>();

  app.get(
    "/ws",
    async (c, next) => {
      if (
        manager === null ||
        !config.developerTerminal ||
        config.agentsRepo === null
      ) {
        return c.text(
          "Agent orchestration is not enabled on this instance.",
          403,
        );
      }
      if (!isLoopbackAddress(remoteAddress(c))) {
        return c.text("Agent runs only accept local connections.", 403);
      }
      if (!c.get("session")) {
        return c.text("You need to sign in to watch a run.", 401);
      }
      return next();
    },
    upgradeWebSocket((c) => {
      const id = c.req.query("id") ?? "";
      return {
        onOpen: (_event, ws) => {
          const run = manager?.get(id);
          if (run === undefined) {
            ws.close();
            return;
          }
          // onData replays the run's scrollback, so a late viewer catches up.
          run.onData((chunk) => ws.send(serverDataFrame(chunk)));
          void run.completion
            .then((result) => {
              ws.send(serverExitFrame(result.exitCode));
              ws.close();
            })
            .catch(() => ws.close());
        },
        onMessage: (event) => {
          const run = manager?.get(id);
          if (run === undefined) {
            return;
          }
          const raw = typeof event.data === "string" ? event.data : "";
          const message = parseClientMessage(raw);
          if (message === null) {
            return;
          }
          if (message.type === "input") {
            run.write(message.data);
          } else {
            run.resize(message.cols, message.rows);
          }
        },
        // A closed socket leaves the run alive; removal is explicit.
        onClose: () => undefined,
      };
    }),
  );

  return app;
};
