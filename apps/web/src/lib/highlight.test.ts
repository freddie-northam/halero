import { describe, expect, test } from "bun:test";
import { HIGHLIGHT_END, HIGHLIGHT_START, splitHighlighted } from "./highlight";

// The server's highlight markers, redeclared raw on purpose: the test
// pins the exported constants to the core byte values.
const START = "\u0001";
const END = "\u0002";

describe("splitHighlighted", () => {
  test("pins the exported markers to the core byte values", () => {
    expect(HIGHLIGHT_START).toBe(START);
    expect(HIGHLIGHT_END).toBe(END);
  });

  test("returns one plain segment for text without markers", () => {
    expect(splitHighlighted("Budget review")).toEqual([
      { text: "Budget review", highlighted: false },
    ]);
  });

  test("returns no segments for an empty string", () => {
    expect(splitHighlighted("")).toEqual([]);
  });

  test("splits a single marked region into plain and highlighted parts", () => {
    expect(splitHighlighted(`${START}Budget${END} review`)).toEqual([
      { text: "Budget", highlighted: true },
      { text: " review", highlighted: false },
    ]);
  });

  test("splits multiple marked regions in order", () => {
    expect(
      splitHighlighted(`the ${START}budget${END} and ${START}plan${END}`),
    ).toEqual([
      { text: "the ", highlighted: false },
      { text: "budget", highlighted: true },
      { text: " and ", highlighted: false },
      { text: "plan", highlighted: true },
    ]);
  });

  test("drops an empty marked region instead of emitting an empty segment", () => {
    expect(splitHighlighted(`a${START}${END}b`)).toEqual([
      { text: "a", highlighted: false },
      { text: "b", highlighted: false },
    ]);
  });

  // Security boundary: stored content can contain raw marker bytes, and
  // the server passes them through highlight() verbatim. Stray markers
  // must be stripped, never interpreted, so poisoned content cannot
  // fabricate or shift highlight regions.
  describe("poisoned content", () => {
    test("a stray start marker cannot fabricate a highlight region", () => {
      // A poisoned title like "evil\u0001pwn": a naive split would render
      // "pwn" (attacker-chosen text) as a match.
      expect(splitHighlighted(`evil${START}pwn`)).toEqual([
        { text: "evilpwn", highlighted: false },
      ]);
    });

    test("a stray end marker cannot shift a genuine region", () => {
      // Poisoned prefix "a\u0002b" before a genuine match: an alternating
      // split would move the highlight off "x" onto attacker text.
      expect(splitHighlighted(`a${END}b ${START}x${END}`)).toEqual([
        { text: "ab ", highlighted: false },
        { text: "x", highlighted: true },
      ]);
    });

    test("a stray start before a genuine region leaves only the match marked", () => {
      // "bad\u0001guy" poisoned in storage, then the server marks "guy"
      // as the genuine match: highlight() yields "bad\u0001\u0001guy\u0002".
      expect(splitHighlighted(`bad${START}${START}guy${END}`)).toEqual([
        { text: "bad", highlighted: false },
        { text: "guy", highlighted: true },
      ]);
    });

    test("marker bytes never reach the rendered segments", () => {
      const poisoned = `${START}a${START}b${END}c${END} ${START}${END}${END}`;
      const segments = splitHighlighted(poisoned);
      const rendered = segments.map((segment) => segment.text).join("");
      expect(rendered).not.toContain(START);
      expect(rendered).not.toContain(END);
    });

    test("an unterminated genuine-looking region renders as plain text", () => {
      expect(splitHighlighted(`${START}dangling`)).toEqual([
        { text: "dangling", highlighted: false },
      ]);
    });
  });
});
