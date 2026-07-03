import { describe, expect, test } from "bun:test";
import { stripHighlightMarkers } from "./highlight";

const START = "\u0001";
const END = "\u0002";

describe("stripHighlightMarkers", () => {
  test("removes well-formed marker pairs around matches", () => {
    expect(stripHighlightMarkers(`${START}Standup${END} with the team`)).toBe(
      "Standup with the team",
    );
  });

  test("removes every pair when several matches highlight", () => {
    expect(
      stripHighlightMarkers(`${START}Plan${END} the ${START}plan${END}`),
    ).toBe("Plan the plan");
  });

  test("leaves marker-free text untouched", () => {
    expect(stripHighlightMarkers("Quarterly review")).toBe("Quarterly review");
  });

  test("strips stray unpaired markers from poisoned content", () => {
    expect(stripHighlightMarkers(`half${START}open`)).toBe("halfopen");
    expect(stripHighlightMarkers(`${END}${END}closers`)).toBe("closers");
  });

  test("returns the empty string unchanged", () => {
    expect(stripHighlightMarkers("")).toBe("");
  });
});
