import { describe, expect, test } from "bun:test";
import type { Task } from "../contract";
import type { TasksApi } from "./api";
import { createNewTaskCommand } from "./new-task-command";

const createdTask = (title: string): Task => ({
  entityId: "t-new",
  title,
  status: "open",
  dueDate: null,
  notes: null,
  completedAt: null,
});

/** A TasksApi where only create is live; reads never run here. */
const apiWithCreate = (create: TasksApi["create"]): TasksApi => ({
  list: () => Promise.reject(new Error("not under test")),
  today: () => Promise.reject(new Error("not under test")),
  create,
  toggle: () => Promise.reject(new Error("not under test")),
  delete: () => Promise.reject(new Error("not under test")),
});

describe("the new-task command", () => {
  const command = createNewTaskCommand(
    apiWithCreate(() => Promise.reject(new Error("not under test"))),
  );

  test("identifies itself as tasks.new", () => {
    expect(command.id).toBe("tasks.new");
  });

  test("describes empty and whitespace input as the bare prompt", () => {
    expect(command.describe("")).toBe("New task...");
    expect(command.describe("   ")).toBe("New task...");
  });

  test("describes typed input with the trimmed title", () => {
    expect(command.describe("  buy milk  ")).toBe("New task: buy milk");
  });

  test("rejects a blank title readably without calling create", async () => {
    const calls: string[] = [];
    const rejecting = createNewTaskCommand(
      apiWithCreate((input) => {
        calls.push(input.title);
        return Promise.resolve(createdTask(input.title));
      }),
    );

    await expect(rejecting.run("   ")).rejects.toThrow("A task needs a title.");
    expect(calls).toEqual([]);
  });

  test("creates once with the trimmed title and confirms on /tasks", async () => {
    const calls: Array<{ title: string; dueDate?: string }> = [];
    const creating = createNewTaskCommand(
      apiWithCreate((input) => {
        calls.push(input);
        return Promise.resolve(createdTask(input.title));
      }),
    );

    const result = await creating.run("  buy milk  ");

    expect(calls).toEqual([{ title: "buy milk" }]);
    expect(result).toEqual({
      message: "Task added.",
      navigateTo: { path: "/tasks" },
    });
  });
});
