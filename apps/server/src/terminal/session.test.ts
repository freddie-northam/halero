import { describe, expect, test } from "bun:test";
import { PtySession } from "./session";

// These tests spawn real short-lived processes attached to a real PTY
// (bun:ffi openpty). They assert TTY semantics, not mocks.

const collect = (session: PtySession): { text: () => string } => {
  let text = "";
  session.onData((chunk) => {
    text += chunk;
  });
  return { text: () => text };
};

describe("PtySession", () => {
  test("streams a command's output and resolves with its exit code", async () => {
    const session = PtySession.start({
      command: "/bin/sh",
      args: ["-c", "printf hello-pty"],
    });
    const out = collect(session);
    const code = await session.exited;

    expect(code).toBe(0);
    expect(out.text()).toContain("hello-pty");
  });

  test("runs the child under a real tty", async () => {
    const session = PtySession.start({
      command: "/bin/sh",
      args: ["-c", "tty"],
    });
    const out = collect(session);
    await session.exited;

    expect(out.text()).toMatch(/\/dev\/(pts|ttys)/);
  });

  test("writes input to the pty, which the tty echoes back", async () => {
    const session = PtySession.start({ command: "/bin/cat" });
    const out = collect(session);
    session.write("ping-me\n");
    await Bun.sleep(150);
    expect(out.text()).toContain("ping-me");
    session.kill();
    await session.exited;
  });

  test("resize changes the tty window, seen by stty size", async () => {
    const session = PtySession.start({
      command: "/bin/sh",
      args: ["-c", "sleep 0.15; stty size"],
      cols: 80,
      rows: 24,
    });
    const out = collect(session);
    session.resize(100, 40);
    await session.exited;
    // stty size prints "<rows> <cols>".
    expect(out.text().trim()).toContain("40 100");
  });

  test("kill terminates a long-running session", async () => {
    const session = PtySession.start({
      command: "/bin/sh",
      args: ["-c", "sleep 30"],
    });
    session.kill();
    const code = await session.exited;
    expect(typeof code).toBe("number");
  });
});
