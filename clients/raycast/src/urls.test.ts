import { describe, expect, test } from "bun:test";
import { agendaUrl, kindLabel, normalizeBaseUrl, searchHitUrl } from "./urls";

const BASE = "http://localhost:4253";

describe("normalizeBaseUrl", () => {
  test("strips trailing slashes", () => {
    expect(normalizeBaseUrl("http://localhost:4253/")).toBe(BASE);
    expect(normalizeBaseUrl("http://localhost:4253//")).toBe(BASE);
  });

  test("leaves a clean base URL untouched", () => {
    expect(normalizeBaseUrl(BASE)).toBe(BASE);
  });
});

describe("kindLabel", () => {
  test("labels the mapped kinds like the web palette does", () => {
    expect(kindLabel("calendar.event")).toBe("Event");
    expect(kindLabel("task.item")).toBe("Task");
  });

  test("falls back to the raw kind for unmapped kinds", () => {
    expect(kindLabel("note.page")).toBe("note.page");
  });
});

describe("searchHitUrl", () => {
  test("sends dated events to the agenda anchored on their date", () => {
    expect(
      searchHitUrl(BASE, {
        kind: "calendar.event",
        occurredDate: "2026-07-03",
      }),
    ).toBe(`${BASE}/calendar?view=agenda&date=2026-07-03`);
  });

  test("omits the date param for undated events", () => {
    expect(
      searchHitUrl(BASE, { kind: "calendar.event", occurredDate: null }),
    ).toBe(`${BASE}/calendar?view=agenda`);
  });

  test("sends tasks to the tasks page", () => {
    expect(
      searchHitUrl(BASE, { kind: "task.item", occurredDate: "2026-07-03" }),
    ).toBe(`${BASE}/tasks`);
  });

  test("sends unmapped kinds to the app root", () => {
    expect(searchHitUrl(BASE, { kind: "note.page", occurredDate: null })).toBe(
      `${BASE}/`,
    );
  });

  test("tolerates a trailing slash in the base URL", () => {
    expect(
      searchHitUrl(`${BASE}/`, { kind: "task.item", occurredDate: null }),
    ).toBe(`${BASE}/tasks`);
  });
});

describe("agendaUrl", () => {
  test("opens the agenda view anchored on the given date", () => {
    expect(agendaUrl(BASE, "2026-07-03")).toBe(
      `${BASE}/calendar?view=agenda&date=2026-07-03`,
    );
  });

  test("tolerates a trailing slash in the base URL", () => {
    expect(agendaUrl(`${BASE}/`, "2026-07-03")).toBe(
      `${BASE}/calendar?view=agenda&date=2026-07-03`,
    );
  });
});
