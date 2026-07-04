// The one place Halero touches libc for a real PTY. Bun has no native
// PTY and node-pty does not run under Bun (its posix_spawn helper fails),
// so we open a pseudo-terminal through bun:ffi (openpty) and attach a
// child to its slave fd via Bun.spawn. This keeps the terminal inside the
// single Bun process: no native addon, no sidecar. See PtySession.

import { cc, dlopen, FFIType, ptr } from "bun:ffi";
import { join } from "node:path";

const isDarwin = process.platform === "darwin";

// openpty lives in libutil; on macOS that reexports libSystem, on Linux
// it is libutil.so.1. Both endpoints below are non-variadic, so plain FFI
// is safe (unlike ioctl, which needs the cc shim in winsize.c).
const UTIL_LIB = isDarwin ? "libutil.dylib" : "libutil.so.1";

const util = dlopen(UTIL_LIB, {
  openpty: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.int,
  },
});

// struct winsize { unsigned short ws_row, ws_col, ws_xpixel, ws_ypixel; }
const winsizeStruct = (cols: number, rows: number): Uint16Array =>
  new Uint16Array([rows, cols, 0, 0]);

export interface PtyPair {
  readonly masterFd: number;
  readonly slaveFd: number;
}

/**
 * Opens a pseudo-terminal at the given size and returns its master/slave
 * file descriptors. The size is set atomically via openpty's winp so the
 * child sees the right dimensions from its first read. Throws a readable
 * error if the kernel refuses.
 */
export const openPty = (cols: number, rows: number): PtyPair => {
  const master = new Int32Array(1);
  const slave = new Int32Array(1);
  const rc = util.symbols.openpty(
    ptr(master),
    ptr(slave),
    null,
    null,
    ptr(winsizeStruct(cols, rows)),
  );
  if (rc !== 0) {
    throw new Error("Could not open a terminal (openpty failed).");
  }
  return { masterFd: master[0] as number, slaveFd: slave[0] as number };
};

// ioctl is variadic; bun:ffi mispasses variadic args on Apple arm64, so
// the fixed-arity shim in winsize.c does the ioctl. Compiled lazily on
// first resize so merely importing this module (e.g. at boot when the
// terminal is disabled) never invokes the C compiler.
let setWinsizeSymbol:
  | ((fd: number, rows: number, cols: number) => number)
  | null = null;

const resolveSetWinsize = (): ((
  fd: number,
  rows: number,
  cols: number,
) => number) => {
  if (setWinsizeSymbol === null) {
    const { symbols } = cc({
      source: join(import.meta.dir, "winsize.c"),
      symbols: {
        hl_set_winsize: { args: ["int", "int", "int"], returns: "int" },
      },
    });
    setWinsizeSymbol = symbols.hl_set_winsize as (
      fd: number,
      rows: number,
      cols: number,
    ) => number;
  }
  return setWinsizeSymbol;
};

/**
 * Resizes a live terminal; the kernel delivers SIGWINCH to the foreground
 * process group, so a running shell reflows on its own.
 */
export const setWinSize = (fd: number, cols: number, rows: number): void => {
  resolveSetWinsize()(fd, rows, cols);
};
