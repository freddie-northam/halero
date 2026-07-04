import { describe, expect, test } from "bun:test";
import type { ProgressApi } from "./api";
import { createProgressWebModule } from "./index";

const notUnderTest = () => Promise.reject(new Error("not under test"));

const stubApi: ProgressApi = {
  status: () => Promise.resolve({ sources: [] }),
  heatmap: notUnderTest,
  refresh: notUnderTest,
  reviewRequests: notUnderTest,
  myOpenPullRequests: notUnderTest,
  assignedIssues: notUnderTest,
  repositories: notUnderTest,
  summary: notUnderTest,
};

describe("the progress web module", () => {
  const module = createProgressWebModule(stubApi);

  test("keeps the progress id (no data migration)", () => {
    expect(module.id).toBe("progress");
  });

  test("contributes the Developer nav entry after Notes", () => {
    expect(module.nav).toEqual([
      { label: "Developer", path: "/developer", order: 40 },
    ]);
  });

  test("contributes the /developer page", () => {
    expect(module.pages?.map((page) => page.path)).toEqual(["/developer"]);
  });
});
