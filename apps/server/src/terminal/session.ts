// One interactive terminal: a shell (or any command) attached to a real
// PTY, with bidirectional I/O over the pty master fd. The FFI lives in
// ./pty; this file owns the process lifecycle, the read pump, and a
// bounded scrollback buffer so a (re)connecting client can be replayed
// the current screen. Arbitrary command execution: callers must gate it.

import fs from "node:fs";
import { openPty, setWinSize } from "./pty";

export interface PtyStartOptions {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cols?: number;
  readonly rows?: number;
  readonly cwd?: string;
  readonly env?: Record<string, string>;
}

type DataListener = (chunk: string) => void;

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
// Scrollback replayed to a fresh listener; oldest bytes drop past this.
const MAX_BUFFER_BYTES = 1_000_000;

export class PtySession {
  readonly exited: Promise<number>;
  readonly #masterFd: number;
  readonly #child: Bun.Subprocess;
  #listeners: DataListener[] = [];
  #buffer = "";
  #closed = false;

  private constructor(masterFd: number, child: Bun.Subprocess) {
    this.#masterFd = masterFd;
    this.#child = child;
    this.exited = child.exited.then((code) => {
      this.#teardown();
      return code;
    });
    this.#pump();
  }

  static start(options: PtyStartOptions): PtySession {
    const cols = options.cols ?? DEFAULT_COLS;
    const rows = options.rows ?? DEFAULT_ROWS;
    // Size is set atomically at open so the child never briefly sees 80x24.
    const { masterFd, slaveFd } = openPty(cols, rows);
    const child = Bun.spawn([options.command, ...(options.args ?? [])], {
      // The child's stdio IS the pty slave, so it believes it owns a tty.
      stdio: [slaveFd, slaveFd, slaveFd],
      cwd: options.cwd,
      env: options.env ?? (process.env as Record<string, string>),
    });
    // The parent keeps only the master; closing our slave copy lets the
    // master see EOF once the child and its children release theirs.
    fs.closeSync(slaveFd);
    return new PtySession(masterFd, child);
  }

  /** Subscribes to output; a late subscriber is replayed the scrollback. */
  onData(listener: DataListener): void {
    if (this.#buffer.length > 0) {
      listener(this.#buffer);
    }
    this.#listeners.push(listener);
  }

  /** Sends keystrokes to the terminal. No-op once the session has ended. */
  write(data: string): void {
    if (this.#closed) {
      return;
    }
    try {
      fs.writeSync(this.#masterFd, data);
    } catch {
      // The pty can close between the guard and the write; a dropped
      // keystroke on a dead terminal is not an error worth surfacing.
    }
  }

  /** Resizes the terminal; the shell reflows via the kernel's SIGWINCH. */
  resize(cols: number, rows: number): void {
    if (this.#closed) {
      return;
    }
    setWinSize(this.#masterFd, cols, rows);
  }

  /** Signals the child; the exited promise resolves once it is reaped. */
  kill(signal: NodeJS.Signals | number = "SIGHUP"): void {
    try {
      this.#child.kill(signal as number);
    } catch {
      // Already gone.
    }
  }

  #emit(chunk: string): void {
    this.#buffer += chunk;
    if (this.#buffer.length > MAX_BUFFER_BYTES) {
      this.#buffer = this.#buffer.slice(-MAX_BUFFER_BYTES);
    }
    for (const listener of this.#listeners) {
      listener(chunk);
    }
  }

  #pump(): void {
    const buffer = Buffer.alloc(65_536);
    const read = (): void => {
      if (this.#closed) {
        return;
      }
      fs.read(this.#masterFd, buffer, 0, buffer.length, null, (error, n) => {
        if (this.#closed) {
          return;
        }
        if (error !== null) {
          // EIO on the master is the normal "slave closed" signal.
          return;
        }
        if (n > 0) {
          this.#emit(buffer.subarray(0, n).toString("utf8"));
        }
        read();
      });
    };
    read();
  }

  #teardown(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    try {
      fs.closeSync(this.#masterFd);
    } catch {
      // Already closed.
    }
    this.#listeners = [];
  }
}
