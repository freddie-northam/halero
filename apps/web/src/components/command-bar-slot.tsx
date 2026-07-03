import type { ReactElement } from "react";

export interface CommandBarSlotProps {
  /** Opens the command palette; the shell owns the open state. */
  readonly onSearchClick: () => void;
  /** Opens Settings; Settings lives behind this avatar, not the sidebar. */
  readonly onSettingsClick: () => void;
}

/**
 * The header's universal-search trigger plus the account avatar that opens
 * Settings. The slot is a layout contract: `data-slot="command-bar"` and
 * the header frame stay put as the search surface evolves.
 */
export const CommandBarSlot = ({
  onSearchClick,
  onSettingsClick,
}: CommandBarSlotProps): ReactElement => (
  <header className="flex h-11 shrink-0 items-center gap-3 border-b bg-card px-4">
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
    <button
      type="button"
      aria-label="Settings"
      onClick={onSettingsClick}
      className="ml-auto flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md bg-primary/10 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
    >
      H
    </button>
  </header>
);
