import { describe, expect, test } from "bun:test";
import { TerminalSessionManager } from "./manager";

const sleeper = { command: "/bin/sh", args: ["-c", "sleep 30"] } as const;

describe("TerminalSessionManager", () => {
  test("creates a session and returns it by id", () => {
    const manager = new TerminalSessionManager({ now: () => 1000 });
    const created = manager.create(sleeper);

    expect(manager.get(created.id)).toBe(created.session);
    expect(manager.list()).toEqual([{ id: created.id, createdAt: 1000 }]);
    manager.killAll();
  });

  test("enforces the max concurrent session limit", async () => {
    const manager = new TerminalSessionManager({ maxSessions: 2 });
    manager.create(sleeper);
    manager.create(sleeper);

    expect(() => manager.create(sleeper)).toThrow(/limit|maximum|too many/i);
    expect(manager.list()).toHaveLength(2);
    manager.killAll();
    await Bun.sleep(20);
  });

  test("removes a session after it is killed", async () => {
    const manager = new TerminalSessionManager({});
    const created = manager.create(sleeper);

    manager.kill(created.id);
    await created.session.exited;
    await Bun.sleep(20);

    expect(manager.get(created.id)).toBeUndefined();
    expect(manager.list()).toHaveLength(0);
  });

  test("auto-removes a session that exits on its own", async () => {
    const manager = new TerminalSessionManager({});
    const created = manager.create({
      command: "/bin/sh",
      args: ["-c", "exit 0"],
    });

    await created.session.exited;
    await Bun.sleep(20);

    expect(manager.get(created.id)).toBeUndefined();
    expect(manager.list()).toHaveLength(0);
  });

  test("write and resize route to the named session without throwing", async () => {
    const manager = new TerminalSessionManager({});
    const created = manager.create({ command: "/bin/cat" });

    expect(() => manager.write(created.id, "hi\n")).not.toThrow();
    expect(() => manager.resize(created.id, 120, 40)).not.toThrow();
    // Unknown ids are a no-op, not a crash.
    expect(() => manager.write("nope", "x")).not.toThrow();

    manager.killAll();
    await created.session.exited;
  });
});
