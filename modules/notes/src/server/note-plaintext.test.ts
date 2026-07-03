import { describe, expect, test } from "bun:test";
import { notePlaintext } from "./note-plaintext";

describe("notePlaintext", () => {
  test("returns empty string for a non-array document", () => {
    expect(notePlaintext(undefined)).toBe("");
    expect(notePlaintext(null)).toBe("");
    expect(notePlaintext({ type: "paragraph" })).toBe("");
  });

  test("returns empty string for an empty document", () => {
    expect(notePlaintext([])).toBe("");
  });

  test("returns empty string for a blank paragraph", () => {
    expect(notePlaintext([{ type: "paragraph", content: [] }])).toBe("");
  });

  test("flattens a single paragraph's styled runs", () => {
    const document = [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Book " },
          { type: "text", text: "flights", styles: { bold: true } },
        ],
      },
    ];

    expect(notePlaintext(document)).toBe("Book flights");
  });

  test("joins separate blocks with newlines", () => {
    const document = [
      { type: "heading", content: [{ type: "text", text: "Trip plan" }] },
      { type: "paragraph", content: [{ type: "text", text: "Pack light" }] },
    ];

    expect(notePlaintext(document)).toBe("Trip plan\nPack light");
  });

  test("descends into a link wrapper's nested content", () => {
    const document = [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "See " },
          {
            type: "link",
            href: "https://example.com",
            content: [{ type: "text", text: "the itinerary" }],
          },
        ],
      },
    ];

    expect(notePlaintext(document)).toBe("See the itinerary");
  });

  test("includes nested child blocks (toggles, nested lists)", () => {
    const document = [
      {
        type: "toggleListItem",
        content: [{ type: "text", text: "Details" }],
        children: [
          {
            type: "bulletListItem",
            content: [{ type: "text", text: "Hidden point" }],
          },
        ],
      },
    ];

    expect(notePlaintext(document)).toBe("Details\nHidden point");
  });

  test("skips unrecognizable inline nodes without throwing", () => {
    const document = [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Kept" },
          { type: "mystery", data: 42 },
          "a bare string is not a valid run",
        ],
      },
    ];

    expect(notePlaintext(document)).toBe("Kept");
  });

  test("caps very long text at the snippet limit", () => {
    const long = "x".repeat(5000);
    const document = [
      { type: "paragraph", content: [{ type: "text", text: long }] },
    ];

    expect(notePlaintext(document)).toHaveLength(2000);
  });
});
