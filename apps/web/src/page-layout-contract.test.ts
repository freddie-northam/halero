// The layout guard: the design foundation is only enforced if it is
// mechanically checked. Every top-level page screen must render the shared
// PageHeader (so titles/actions stay identical) and must NOT hand-roll its own
// width wrapper (the shell's PageContainer is the single width authority). A new
// page that copies the old `mx-auto w-full max-w-*` pattern or forgets the
// header fails here. Detail/editor routes with a deliberately different shape
// are listed as explicit exemptions. See docs/design-system.md.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

const repoRoot = join(import.meta.dir, "..", "..", "..");

// Screens that legitimately differ from the standard title+body page.
const EXEMPT_SCREENS = new Set(["note-detail-screen.tsx"]);

// The page-root wrapper signature every page used before the foundation: a
// centred, width-capped column. Pages must not set their own width now.
const OWN_WIDTH_WRAPPER = "mx-auto w-full max-w-";

const pageFiles = (): string[] => {
  const screens = [
    ...new Glob("modules/*/src/web/*-screen.tsx").scanSync(repoRoot),
  ]
    .filter((path) => !EXEMPT_SCREENS.has(path.split("/").pop() ?? ""))
    .sort();
  // Settings is an app-level page, not a module screen, but obeys the same rule.
  return [...screens, "apps/web/src/routes/settings.tsx"];
};

describe("page layout contract", () => {
  const files = pageFiles();

  test("there are page screens to check", () => {
    // Guards the guard: if the glob ever finds nothing, this fails loudly
    // instead of passing vacuously.
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  test.each(files)("%s renders the shared PageHeader", (relPath) => {
    const source = readFileSync(join(repoRoot, relPath), "utf8");
    expect(source).toContain("PageHeader");
  });

  test.each(files)("%s does not set its own width wrapper", (relPath) => {
    const source = readFileSync(join(repoRoot, relPath), "utf8");
    expect(source).not.toContain(OWN_WIDTH_WRAPPER);
  });
});
