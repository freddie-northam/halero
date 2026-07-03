import { describe, expect, test } from "bun:test";
import type { ProgressApi } from "./api";
import { createProgressWebModule } from "./index";

const stubApi: ProgressApi = {
  status: () => Promise.resolve({ sources: [] }),
  heatmap: () => Promise.reject(new Error("not under test")),
  refresh: () => Promise.reject(new Error("not under test")),
};

describe("the progress web module", () => {
  const module = createProgressWebModule(stubApi);

  test("uses the progress id", () => {
    expect(module.id).toBe("progress");
  });

  test("contributes the Progress nav entry after Tasks", () => {
    expect(module.nav).toEqual([
      { label: "Progress", path: "/progress", order: 40 },
    ]);
  });

  test("contributes the /progress page", () => {
    expect(module.pages?.map((page) => page.path)).toEqual(["/progress"]);
  });
});
