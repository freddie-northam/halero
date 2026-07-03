// Flattens a BlockNote block document to plain text for the spine
// snippet (and thus full-text search). The document shape is opaque to
// the server, so the walk is defensive: anything that is not
// recognizable inline text is skipped rather than trusted.

const SNIPPET_MAX_LENGTH = 2000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Concatenates a block's inline content. Inline runs are either styled
 * text ({ text }) or wrappers that nest more runs ({ content }, e.g. a
 * link); a bare string is accepted too. Anything else contributes
 * nothing.
 */
const inlineText = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((node) => {
      if (!isRecord(node)) {
        return "";
      }
      if (typeof node.text === "string") {
        return node.text;
      }
      if (node.content !== undefined) {
        return inlineText(node.content);
      }
      return "";
    })
    .join("");
};

/** A block's own inline text plus its nested children, newline-joined. */
const blockText = (block: unknown): string => {
  if (!isRecord(block)) {
    return "";
  }
  const parts: string[] = [];
  const own = inlineText(block.content);
  if (own.length > 0) {
    parts.push(own);
  }
  if (Array.isArray(block.children)) {
    for (const child of block.children) {
      const childText = blockText(child);
      if (childText.length > 0) {
        parts.push(childText);
      }
    }
  }
  return parts.join("\n");
};

/**
 * The searchable plain text for a note. Blocks are newline-joined and the
 * result is capped: the router bounds the document size before this runs,
 * and the cap bounds the stored snippet regardless. Returns "" for a
 * non-array (defensive) or an empty document.
 */
export const notePlaintext = (document: unknown): string => {
  if (!Array.isArray(document)) {
    return "";
  }
  const text = document
    .map(blockText)
    .filter((part) => part.length > 0)
    .join("\n");
  return text.length > SNIPPET_MAX_LENGTH
    ? text.slice(0, SNIPPET_MAX_LENGTH)
    : text;
};
