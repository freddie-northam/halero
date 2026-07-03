// The notes module's own API contract: the note shapes its server router
// returns and its web page consumes. Pure types so both entries can
// import them without dragging the other side's dependencies along.

/**
 * A note's block body: the top-level array of BlockNote blocks. Opaque
 * to everything but the editor, so the elements stay `unknown`; the
 * server stores the JSON as-is and never inspects a block's internals.
 */
export type NoteDocument = readonly unknown[];

export interface Note {
  readonly entityId: string;
  readonly title: string;
  readonly document: NoteDocument;
  /** Trimmed, deduplicated; empty when the note has no tags. */
  readonly tags: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * A row in the notes list. Carries the search snippet as a preview
 * instead of the full document, so the list stays a small payload; the
 * editor loads the document on demand via get().
 */
export interface NoteListItem {
  readonly entityId: string;
  readonly title: string;
  /** Plain-text preview from the spine snippet; empty for an empty note. */
  readonly preview: string;
  readonly tags: readonly string[];
  readonly updatedAt: number;
}

export interface NoteList {
  readonly notes: readonly NoteListItem[];
}
