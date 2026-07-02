import type { ReactElement } from "react";

/**
 * Reserved header region for the future universal search command bar.
 * The slot is a layout contract: later tasks replace the hint with a real
 * input without moving anything around it.
 */
export const CommandBarSlot = (): ReactElement => (
  <header className="flex h-11 shrink-0 items-center border-b border-border bg-surface px-4">
    <div
      data-slot="command-bar"
      className="flex h-7 w-full max-w-md items-center rounded-control border border-border bg-bg px-2.5 text-xs text-text-muted"
    >
      Search coming soon
    </div>
  </header>
);
