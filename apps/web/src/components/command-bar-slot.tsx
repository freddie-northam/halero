import type { ReactElement } from "react";

export interface CommandBarSlotProps {
  /** Opens the command palette; the shell owns the open state. */
  readonly onSearchClick: () => void;
}

/**
 * The header's universal-search trigger. The slot is a layout
 * contract: `data-slot="command-bar"` and the header frame stay put
 * as the search surface evolves.
 */
export const CommandBarSlot = ({
  onSearchClick,
}: CommandBarSlotProps): ReactElement => (
  <header className="flex h-11 shrink-0 items-center border-b bg-card px-4">
    <button
      type="button"
      data-slot="command-bar"
      aria-label="Search Halero"
      onClick={onSearchClick}
      className="flex h-7 w-full max-w-md cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <span className="truncate">Search Halero...</span>
      <kbd className="pointer-events-none ml-auto rounded-sm border px-1 font-sans text-[10px] leading-4 text-muted-foreground">
        ⌘K
      </kbd>
    </button>
  </header>
);
