// The Developer terminal's WebSocket endpoint. Every connection is gated
// (opt-in flag + loopback + signed-in session) before the socket upgrades,
// then bridged to a PtySession: pty output -> data frames, client frames
// -> write/resize, socket close -> kill. The manager caps concurrency and
// reaps ended sessions.

import os from "node:os";
import { Hono } from "hono";
import { getConnInfo, upgradeWebSocket } from "hono/bun";
import type { HaleroConfig } from "../config";
import type { AppEnv } from "../middleware/session";
import { isLoopbackAddress } from "./gate";
import type { TerminalSessionManager } from "./manager";
import {
  parseClientMessage,
  serverDataFrame,
  serverExitFrame,
} from "./protocol";
import type { PtySession } from "./session";

export interface TerminalRoutesDeps {
  readonly config: HaleroConfig;
  /** Null when the terminal is disabled; the guard 403s before any upgrade. */
  readonly manager: TerminalSessionManager | null;
}

const MAX_DIM = 1000;

const clampDim = (raw: string | undefined, fallback: number): number => {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 && value <= MAX_DIM
    ? value
    : fallback;
};

const remoteAddress = (c: Parameters<typeof getConnInfo>[0]): string | null => {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
};

export const createTerminalRoutes = (
  deps: TerminalRoutesDeps,
): Hono<AppEnv> => {
  const { config, manager } = deps;
  const app = new Hono<AppEnv>();

  app.get(
    "/ws",
    // Gate BEFORE the upgrade: opt-in, loopback-only, authenticated.
    async (c, next) => {
      if (manager === null || !config.developerTerminal) {
        return c.text(
          "The developer terminal is not enabled on this instance.",
          403,
        );
      }
      if (!isLoopbackAddress(remoteAddress(c))) {
        return c.text(
          "The developer terminal only accepts local connections.",
          403,
        );
      }
      if (c.get("session") === null) {
        return c.text("You need to sign in to open a terminal.", 401);
      }
      return next();
    },
    upgradeWebSocket((c) => {
      const cols = clampDim(c.req.query("cols"), 80);
      const rows = clampDim(c.req.query("rows"), 24);
      let session: PtySession | null = null;
      return {
        onOpen: (_event, ws) => {
          if (manager === null) {
            ws.close();
            return;
          }
          try {
            const created = manager.create({
              cols,
              rows,
              cwd: os.homedir(),
              env: {
                ...(process.env as Record<string, string>),
                TERM: "xterm-256color",
              },
            });
            session = created.session;
            session.onData((chunk) => {
              ws.send(serverDataFrame(chunk));
            });
            void session.exited.then((code) => {
              ws.send(serverExitFrame(code));
              ws.close();
            });
          } catch (error) {
            ws.send(
              serverDataFrame(
                `\r\n${error instanceof Error ? error.message : "Could not open a terminal."}\r\n`,
              ),
            );
            ws.close();
          }
        },
        onMessage: (event) => {
          if (session === null) {
            return;
          }
          const raw = typeof event.data === "string" ? event.data : "";
          const message = parseClientMessage(raw);
          if (message === null) {
            return;
          }
          if (message.type === "input") {
            session.write(message.data);
          } else {
            session.resize(message.cols, message.rows);
          }
        },
        onClose: () => {
          session?.kill();
        },
      };
    }),
  );

  return app;
};
