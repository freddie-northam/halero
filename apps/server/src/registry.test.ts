import { describe, expect, test } from "bun:test";
import { calendarServerModule } from "@halero/module-calendar/server";
import { tasksServerModule } from "@halero/module-tasks/server";
import { CALENDAR_EVENT_KIND, TASK_ITEM_KIND } from "@halero/schemas";
import { kindRegistry, modulesRouter, serverModules } from "./registry";

describe("the shipped module registry", () => {
  test("resolves calendar.event to the calendar module's contribution", () => {
    const registered = kindRegistry.get(CALENDAR_EVENT_KIND);

    expect(registered?.moduleId).toBe("calendar");
    expect(registered?.schemaVersion).toBe(1);
    expect(registered?.satelliteWriter).toBeDefined();
  });

  test("resolves task.item to the tasks module's contribution", () => {
    const registered = kindRegistry.get(TASK_ITEM_KIND);

    expect(registered?.moduleId).toBe("tasks");
    expect(registered?.schemaVersion).toBe(1);
    // Native kind: no connector produces tasks, so no satellite writer.
    expect(registered?.satelliteWriter).toBeUndefined();
  });

  test("knows no kinds outside the registered modules", () => {
    expect(kindRegistry.get("widget.gadget")).toBeUndefined();
  });

  test("mounts every module router under its own manifest id", () => {
    // tRPC flattens nested routers into a procedure record per namespace.
    const record = modulesRouter._def.record as Record<
      string,
      Record<string, unknown>
    >;
    const routedIds = serverModules
      .filter((module) => module.router !== undefined)
      .map((module) => module.id);

    expect(Object.keys(record).toSorted()).toEqual([...routedIds].sort());
    expect(record.calendar?.agenda).toBe(
      calendarServerModule.router._def.record.agenda,
    );
    expect(record.tasks?.list).toBe(tasksServerModule.router._def.record.list);
  });
});
