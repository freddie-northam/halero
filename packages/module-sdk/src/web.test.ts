import { describe, expect, test } from "bun:test";
import {
  type CommandContribution,
  type CommandRunResult,
  defineWebModule,
  type WebModule,
} from "./web";

describe("defineWebModule", () => {
  test("returns the module untouched", () => {
    const module: WebModule = {
      id: "calendar",
      nav: [{ label: "Calendar", path: "/calendar", order: 20 }],
      pages: [{ path: "/calendar", component: () => null }],
    };

    expect(defineWebModule(module)).toBe(module);
  });

  test("preserves the concrete shape for module authors", () => {
    const module = defineWebModule({
      id: "calendar",
      nav: [{ label: "Calendar", path: "/calendar", order: 20 }],
    });

    expect(module.nav[0]?.order).toBe(20);
  });

  test("passes command contributions through untouched", async () => {
    const contribution: CommandContribution = {
      id: "tasks.new",
      describe: (input) =>
        input.trim() === "" ? null : `New task: ${input.trim()}`,
      run: (input) =>
        Promise.resolve({
          message: `Added ${input}.`,
          navigateTo: { path: "/tasks", search: { filter: "open" } },
        }),
    };
    const module = defineWebModule({ id: "tasks", commands: [contribution] });

    const command = module.commands[0];
    expect(command?.id).toBe("tasks.new");
    expect(command?.describe("")).toBeNull();
    expect(command?.describe("buy milk")).toBe("New task: buy milk");
    const result: CommandRunResult | undefined = await command?.run("buy milk");
    expect(result).toEqual({
      message: "Added buy milk.",
      navigateTo: { path: "/tasks", search: { filter: "open" } },
    });
  });

  test("passes entity link contributions through untouched", () => {
    const module = defineWebModule({
      id: "calendar",
      entityLinks: [
        {
          kind: "calendar.event",
          label: "Event",
          buildLink: (hit) =>
            hit.occurredDate === null
              ? { path: "/calendar" }
              : { path: "/calendar", search: { date: hit.occurredDate } },
        },
      ],
    });

    const link = module.entityLinks[0];
    expect(link?.kind).toBe("calendar.event");
    expect(link?.label).toBe("Event");
    expect(
      link?.buildLink({ entityId: "e1", occurredDate: "2023-11-14" }),
    ).toEqual({ path: "/calendar", search: { date: "2023-11-14" } });
    expect(link?.buildLink({ entityId: "e1", occurredDate: null })).toEqual({
      path: "/calendar",
    });
  });
});
