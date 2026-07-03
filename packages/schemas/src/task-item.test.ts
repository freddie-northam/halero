import { describe, expect, test } from "bun:test";
import {
  TASK_ITEM_KIND,
  type TaskSatellite,
  taskSatelliteSchema,
} from "./task-item";

describe("taskSatelliteSchema", () => {
  const satellite: TaskSatellite = {
    status: "open",
    dueDate: null,
    completedAt: null,
    notes: null,
  };

  test("parses a valid open-task payload", () => {
    expect(taskSatelliteSchema.parse(satellite)).toEqual(satellite);
  });

  test("parses a completed payload with a due date and notes", () => {
    const done: TaskSatellite = {
      status: "done",
      dueDate: "2026-07-01",
      completedAt: 1_700_000_000_000,
      notes: "handed off to accounting",
    };

    expect(taskSatelliteSchema.parse(done)).toEqual(done);
  });

  test("rejects a payload without a status", () => {
    const { status: _dropped, ...rest } = satellite;

    expect(taskSatelliteSchema.safeParse(rest).success).toBe(false);
  });

  test("rejects a status outside open and done", () => {
    const parsed = taskSatelliteSchema.safeParse({
      ...satellite,
      status: "blocked",
    });

    expect(parsed.success).toBe(false);
  });
});

test("TASK_ITEM_KIND identifies the task item kind", () => {
  expect(TASK_ITEM_KIND).toBe("task.item");
});
