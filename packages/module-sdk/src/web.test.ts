import { describe, expect, test } from "bun:test";
import { defineWebModule, type WebModule } from "./web";

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
});
