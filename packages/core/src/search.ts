// Full-text search over the entity spine via the entities_fts index
// (external content, trigger-maintained since migration 0001).
//
// toFtsQuery is the security boundary between raw keystrokes and FTS5
// query syntax: every token is emitted as a quoted phrase with a prefix
// star, so no user input can ever reach MATCH as an operator (AND/OR/
// NOT/NEAR, col:, parentheses, ^, -, *). Searching must never throw on
// user input.
//
// WARNING: never run plain VACUUM on this database. entities_fts is an
// external-content index keyed to the implicit rowids of entities, and
// plain VACUUM may renumber those rowids, corrupting the index. Use
// VACUUM INTO (snapshots) only.

import type { Database } from "bun:sqlite";

export interface SearchQuery {
  readonly query: string;
  readonly kind?: string;
  readonly limit?: number;
}

export interface SearchHit {
  readonly entityId: string;
  readonly kind: string;
  /** Raw spine title for fallback rendering. */
  readonly title: string | null;
  /** highlight() output using the marker chars. */
  readonly titleHighlighted: string;
  /** snippet(..., '...', 12) output, null when the entity has no snippet. */
  readonly snippetHighlighted: string | null;
  readonly occurredStart: number | null;
}

// The markers are control characters no user can type, so renderers can
// split on them without escaping worries.
/** U+0001 (Start of Heading): opens a highlighted match region. */
export const HIGHLIGHT_START = "\u0001";
/** U+0002 (Start of Text): closes a highlighted match region. */
export const HIGHLIGHT_END = "\u0002";

const MAX_TOKENS = 8;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Turns raw user input into a safe FTS5 query: each whitespace-separated
 * token (capped at 8) becomes a quoted phrase with a prefix star, with
 * embedded double quotes escaped by doubling. Tokens joined by spaces
 * give implicit AND semantics. Returns null for effectively-empty input
 * so callers can skip the query entirely.
 */
export const toFtsQuery = (raw: string): string | null => {
  const phrases = raw
    .trim()
    .split(/\s+/u)
    .slice(0, MAX_TOKENS)
    .filter((token) => token.trim().length > 0)
    .map((token) => `"${token.replaceAll('"', '""')}"*`);
  return phrases.length === 0 ? null : phrases.join(" ");
};

interface SearchRow {
  readonly entityId: string;
  readonly kind: string;
  readonly title: string | null;
  readonly titleHighlighted: string;
  readonly snippetHighlighted: string | null;
  readonly occurredStart: number | null;
}

const clampLimit = (limit: number | undefined): number => {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));
};

/**
 * Searches entity titles and snippets, best matches first (bm25 with the
 * title weighted 10x). Returns [] instead of throwing for empty input.
 */
export const searchEntities = (
  sqlite: Database,
  q: SearchQuery,
): readonly SearchHit[] => {
  const ftsQuery = toFtsQuery(q.query);
  if (ftsQuery === null) {
    return [];
  }
  const kindFilter = q.kind === undefined ? "" : "AND entities.kind = ? ";
  const sql =
    `SELECT entities.id AS entityId, entities.kind AS kind, ` +
    `entities.title AS title, ` +
    `highlight(entities_fts, 0, ?, ?) AS titleHighlighted, ` +
    `snippet(entities_fts, 1, ?, ?, '...', 12) AS snippetHighlighted, ` +
    `entities.occurred_start AS occurredStart ` +
    `FROM entities_fts ` +
    `JOIN entities ON entities.rowid = entities_fts.rowid ` +
    `WHERE entities_fts MATCH ? ` +
    `AND entities.deleted_at IS NULL ` +
    kindFilter +
    `ORDER BY bm25(entities_fts, 10.0, 1.0) ` +
    `LIMIT ?`;
  const params: (string | number)[] = [
    HIGHLIGHT_START,
    HIGHLIGHT_END,
    HIGHLIGHT_START,
    HIGHLIGHT_END,
    ftsQuery,
  ];
  if (q.kind !== undefined) {
    params.push(q.kind);
  }
  params.push(clampLimit(q.limit));
  return sqlite.query<SearchRow, (string | number)[]>(sql).all(...params);
};
