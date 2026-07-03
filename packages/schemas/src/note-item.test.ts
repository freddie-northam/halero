import { describe, expect, test } from "bun:test";
import {
  NOTE_ITEM_KIND,
  type NoteSatellite,
  noteSatelliteSchema,
} from "./note-item";

describe("noteSatelliteSchema", () => {
  const satellite: NoteSatellite = {
    document: [{ type: "paragraph", content: [] }],
  };

  test("parses a minimal note without tags", () => {
    expect(noteSatelliteSchema.parse(satellite)).toEqual(satellite);
  });

  test("parses a note with tags", () => {
    const tagged: NoteSatellite = {
      document: [
        { type: "heading", content: [{ type: "text", text: "Trip plan" }] },
      ],
      tags: ["travel", "2026"],
    };

    expect(noteSatelliteSchema.parse(tagged)).toEqual(tagged);
  });

  test("parses an empty document (a note may have a title but no body)", () => {
    expect(noteSatelliteSchema.parse({ document: [] })).toEqual({
      document: [],
    });
  });

  test("treats block internals as opaque", () => {
    const exotic: NoteSatellite = {
      document: [
        { anything: true, nested: { deeply: [1, 2, 3] } },
        "even a bare string",
      ],
    };

    expect(noteSatelliteSchema.parse(exotic)).toEqual(exotic);
  });

  test("rejects a document that is not an array", () => {
    expect(
      noteSatelliteSchema.safeParse({ document: { type: "paragraph" } })
        .success,
    ).toBe(false);
  });

  test("rejects a payload without a document", () => {
    expect(noteSatelliteSchema.safeParse({ tags: ["orphan"] }).success).toBe(
      false,
    );
  });

  test("rejects tags that are not an array of strings", () => {
    expect(
      noteSatelliteSchema.safeParse({ document: [], tags: "travel" }).success,
    ).toBe(false);
  });
});

test("NOTE_ITEM_KIND identifies the note item kind", () => {
  expect(NOTE_ITEM_KIND).toBe("note.item");
});
