import { describe, expect, test } from "bun:test";
import {
  priorityBadgeClass,
  priorityLabel,
  tagAccentClass,
  tagBadgeClass,
} from "./board-style";

describe("tagAccentClass", () => {
  test("is deterministic: the same tag always gets the same accent", () => {
    expect(tagAccentClass("work")).toBe(tagAccentClass("work"));
  });

  test("differing tags can land on differing accents", () => {
    expect(tagAccentClass("work")).not.toBe(tagAccentClass("home"));
  });

  test("has no accent for a card with no tags", () => {
    expect(tagAccentClass(null)).toBeNull();
  });
});

describe("tagBadgeClass", () => {
  test("is deterministic: the same tag always gets the same badge classes", () => {
    expect(tagBadgeClass("urgent")).toBe(tagBadgeClass("urgent"));
  });

  test("matches the tag's accent hue", () => {
    // Both are keyed off the same hash, so the same tag always picks
    // the same slot in each palette (a bg-rose-500 accent pairs with the
    // rose-toned badge, never a mismatched hue).
    const accent = tagAccentClass("finance");
    const badge = tagBadgeClass("finance");
    const hue = accent?.replace("bg-", "").replace("-500", "");
    expect(hue).not.toBeUndefined();
    expect(badge).toContain(`${hue}-`);
  });
});

describe("priorityLabel", () => {
  test("labels every priority in title case", () => {
    expect(priorityLabel("high")).toBe("High");
    expect(priorityLabel("medium")).toBe("Medium");
    expect(priorityLabel("low")).toBe("Low");
  });
});

describe("priorityBadgeClass", () => {
  test("gives high and medium distinct, warm-toned classes", () => {
    expect(priorityBadgeClass("high")).toContain("red");
    expect(priorityBadgeClass("medium")).toContain("amber");
  });

  test("keeps low muted rather than colored", () => {
    expect(priorityBadgeClass("low")).toContain("muted");
  });

  test("is deterministic per priority", () => {
    expect(priorityBadgeClass("high")).toBe(priorityBadgeClass("high"));
  });
});
