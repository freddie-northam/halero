// The /notes list URL carries an optional filter: ?q=<text>. This
// normalizer runs as both the route's validateSearch and inside the
// screen, so a hand-typed or stale URL always lands on something
// renderable. The filter itself is applied client-side over the already
// loaded list.

export type NotesSearch = {
  readonly q: string;
};

/** Drops anything unrenderable; a missing or non-string q becomes "". */
export const normalizeNotesSearch = (search: unknown): NotesSearch => {
  if (typeof search !== "object" || search === null) {
    return { q: "" };
  }
  const record = search as Record<string, unknown>;
  return { q: typeof record.q === "string" ? record.q : "" };
};

/**
 * Filters a note list by a query over title and preview, case-insensitive.
 * A blank query returns the list unchanged. Pure so the screen can call it
 * directly and a test can pin the matching rules.
 */
export const filterNotes = <
  T extends { readonly title: string; readonly preview: string },
>(
  notes: readonly T[],
  query: string,
): readonly T[] => {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return notes;
  }
  return notes.filter(
    (note) =>
      note.title.toLowerCase().includes(needle) ||
      note.preview.toLowerCase().includes(needle),
  );
};
