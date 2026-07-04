// The registry of live terminals for one Halero instance. Owns session
// ids, a concurrency cap (each session is a real child process), and
// auto-removal when a session ends. The host route in front of this must
// gate access (loopback + auth + explicit opt-in): every session here is
// arbitrary command execution.

import { ulid } from "@halero/core";
import { PtySession } from "./session";

export interface TerminalManagerOptions {
  /** The shell a bare create() launches. Defaults to $SHELL then /bin/sh. */
  readonly shell?: string;
  /** Hard cap on concurrent sessions; each is a child process. */
  readonly maxSessions?: number;
  /** Working directory for new sessions. */
  readonly cwd?: string;
  /** Injectable clock for deterministic createdAt in tests. */
  readonly now?: () => number;
}

export interface CreateTerminalOptions {
  /** Overrides the shell, e.g. to run an agent CLI in its own session. */
  readonly command?: string;
  readonly args?: readonly string[];
  readonly cols?: number;
  readonly rows?: number;
  readonly cwd?: string;
}

export interface TerminalInfo {
  readonly id: string;
  readonly createdAt: number;
}

const DEFAULT_MAX_SESSIONS = 8;
const TOO_MANY_MESSAGE =
  "Too many terminals are open. Close one before opening another.";

interface Entry {
  readonly session: PtySession;
  readonly createdAt: number;
}

export class TerminalSessionManager {
  readonly #sessions = new Map<string, Entry>();
  readonly #shell: string;
  readonly #maxSessions: number;
  readonly #cwd: string | undefined;
  readonly #now: () => number;

  constructor(options: TerminalManagerOptions = {}) {
    this.#shell = options.shell ?? process.env.SHELL ?? "/bin/sh";
    this.#maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.#cwd = options.cwd;
    this.#now = options.now ?? (() => Date.now());
  }

  create(options: CreateTerminalOptions = {}): {
    id: string;
    session: PtySession;
  } {
    if (this.#sessions.size >= this.#maxSessions) {
      throw new Error(TOO_MANY_MESSAGE);
    }
    const id = ulid();
    const session = PtySession.start({
      command: options.command ?? this.#shell,
      args: options.args ?? [],
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd ?? this.#cwd,
    });
    this.#sessions.set(id, { session, createdAt: this.#now() });
    // A session that ends (exit, kill, crash) drops out of the registry.
    void session.exited.then(() => {
      this.#sessions.delete(id);
    });
    return { id, session };
  }

  get(id: string): PtySession | undefined {
    return this.#sessions.get(id)?.session;
  }

  list(): TerminalInfo[] {
    return [...this.#sessions.entries()].map(([id, entry]) => ({
      id,
      createdAt: entry.createdAt,
    }));
  }

  write(id: string, data: string): void {
    this.#sessions.get(id)?.session.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.#sessions.get(id)?.session.resize(cols, rows);
  }

  kill(id: string): void {
    this.#sessions.get(id)?.session.kill();
  }

  killAll(): void {
    for (const entry of this.#sessions.values()) {
      entry.session.kill();
    }
  }
}
