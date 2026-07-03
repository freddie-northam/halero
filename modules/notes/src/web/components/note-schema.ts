// The note editor's block schema: BlockNote's default blocks minus the
// media ones. Image/file/video/audio are dropped in v0.4 because they
// need an upload endpoint and would require relaxing the server's
// img-src/connect-src CSP; the kept set is all text (paragraph, headings,
// bullet/numbered/check lists, quote, code, divider, toggle). The slash
// menu is generated from this schema, so removing the specs also removes
// those options from the "/" menu, with no extra filtering needed.

import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";

const {
  audio: _audio,
  file: _file,
  image: _image,
  video: _video,
  ...textBlockSpecs
} = defaultBlockSpecs;

export const noteSchema = BlockNoteSchema.create({
  blockSpecs: textBlockSpecs,
});

export type NoteSchema = typeof noteSchema;
