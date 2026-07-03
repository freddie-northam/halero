import { describe, expect, test } from "bun:test";
import {
  TASK_ITEM_KIND,
  type TaskSatellite,
  taskSatelliteSchema,
} from "./task-item";

describe("taskSatelliteSchema", () => {
  const satellite: TaskSatellite = {
    status: "todo",
    dueDate: null,
    completedAt: null,
    notes: null,
    loggedMinutes: 0,
  };

  test("parses a minimal todo payload without the optional board fields", () => {
    expect(taskSatelliteSchema.parse(satellite)).toEqual(satellite);
  });

  test("parses a full board payload with priority, tags, and time", () => {
    const done: TaskSatellite = {
      status: "done",
      priority: "high",
      tags: ["errand", "travel"],
      dueDate: "2026-07-01",
      completedAt: 1_700_000_000_000,
      notes: "handed off to accounting",
      estimateMinutes: 90,
      loggedMinutes: 25,
    };

    expect(taskSatelliteSchema.parse(done)).toEqual(done);
  });

  test("parses a doing payload with a null estimate", () => {
    const doing: TaskSatellite = {
      ...satellite,
      status: "doing",
      estimateMinutes: null,
    };

    expect(taskSatelliteSchema.parse(doing)).toEqual(doing);
  });

  test("rejects a payload without a status", () => {
    const { status: _dropped, ...rest } = satellite;

    expect(taskSatelliteSchema.safeParse(rest).success).toBe(false);
  });

  test("rejects the legacy 'open' status", () => {
    const parsed = taskSatelliteSchema.safeParse({
      ...satellite,
      status: "open",
    });

    expect(parsed.success).toBe(false);
  });

  test("rejects a priority outside high, medium, and low", () => {
    const parsed = taskSatelliteSchema.safeParse({
      ...satellite,
      priority: "urgent",
    });

    expect(parsed.success).toBe(false);
  });

  test("rejects tags that are not an array of strings", () => {
    const parsed = taskSatelliteSchema.safeParse({
      ...satellite,
      tags: "errand",
    });

    expect(parsed.success).toBe(false);
  });

  test("rejects a fractional loggedMinutes", () => {
    const parsed = taskSatelliteSchema.safeParse({
      ...satellite,
      loggedMinutes: 1.5,
    });

    expect(parsed.success).toBe(false);
  });
});

test("TASK_ITEM_KIND identifies the task item kind", () => {
  expect(TASK_ITEM_KIND).toBe("task.item");
});
