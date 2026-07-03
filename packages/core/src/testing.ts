// Shared test fixtures, exported as @halero/core/testing so API-level
// suites exercise exactly the corpus the core unit tests harden against.

/**
 * Raw search inputs that try to smuggle FTS5 operators, column filters,
 * quote imbalance, control characters, or highlight-marker spoofing past
 * toFtsQuery. Searching any of these must return results, never throw.
 */
export const HOSTILE_SEARCH_INPUTS: readonly string[] = [
  '"foo" OR "bar',
  "NEAR(a b)",
  "title:secret",
  "a AND b",
  "-neg",
  "(paren",
  "star*mid",
  '"',
  '""""',
  "🚀",
  "AND",
  "NOT NOT",
  "^caret",
  "col: (x OR y) NEAR/2 z",
  "foo\u0000bar",
  "\u0000",
  "a \u0000 b",
  "plan\u0000",
  "\u0001spoof\u0002",
  "   ",
  "",
];
