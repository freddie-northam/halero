// Non-variadic wrapper around ioctl(TIOCSWINSZ). Called through bun:ffi's
// cc: Bun's FFI cannot pass a variadic argument correctly on Apple arm64
// (variadic args go on the stack there), and ioctl is variadic. Compiling
// this fixed-arity shim sidesteps the ABI mismatch entirely. Keeps the
// PTY in-process with no native addon. See pty.ts.
#include <sys/ioctl.h>
#include <termios.h>

int hl_set_winsize(int fd, int rows, int cols) {
  struct winsize ws;
  ws.ws_row = (unsigned short)rows;
  ws.ws_col = (unsigned short)cols;
  ws.ws_xpixel = 0;
  ws.ws_ypixel = 0;
  return ioctl(fd, TIOCSWINSZ, &ws);
}
