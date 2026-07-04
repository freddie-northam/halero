import type { ReactElement, ReactNode } from "react";

import { cn } from "../../lib/utils";

/**
 * The page-layout foundation. Every routed page is framed by these two
 * primitives so width, padding, and the title/actions row are identical across
 * the app and cannot drift page by page. See docs/design-system.md.
 *
 * PageContainer is owned by the shell (it wraps every route), so a page never
 * sets its own width or padding. PageHeader is the only sanctioned page header.
 */

/**
 * The single width/padding authority for page content. It carries no
 * max-width: the shell's inset panel is the one width bound, so every page
 * fills to the same edges. The shell wraps each routed page in this, so pages
 * must not re-declare `mx-auto`/`max-w-*`/`px-*` on their root.
 */
export const PageContainer = ({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement => <div className="w-full px-8 py-8">{children}</div>;

export interface PageHeaderProps {
  /** The one page title (rendered at 18px semibold, the page-title role). */
  readonly title: ReactNode;
  /** Optional muted line under the title (the page-subtitle role). */
  readonly description?: ReactNode;
  /**
   * Right-aligned actions: the page's single coral primary button and/or a
   * Tabs view switcher. Actions live here because they need the page's own
   * handlers; the shared header keeps their placement identical everywhere.
   */
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * The sanctioned page header: title (+ optional description) on the left, an
 * actions slot on the right. The `data-slot="page-header"` marker is what the
 * layout guard test keys on, so every page must render exactly one of these as
 * its first element.
 */
export const PageHeader = ({
  title,
  description,
  children,
  className,
}: PageHeaderProps): ReactElement => (
  <header
    data-slot="page-header"
    className={cn(
      "flex flex-wrap items-start justify-between gap-3",
      className,
    )}
  >
    <div className="min-w-0">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
    {children ? (
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    ) : null}
  </header>
);
