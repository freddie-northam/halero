import { SidebarTrigger } from "@halero/ui";
import type { ReactElement } from "react";
import { HeaderAccount } from "./header-account";

export interface CommandBarSlotProps {
  /** Opens the command palette; the shell owns the open state. */
  readonly onSearchClick: () => void;
  /** Opens Settings; Settings lives behind the avatar, not the sidebar. */
  readonly onSettingsClick: () => void;
}

/**
 * The app header, kept minimal: the universal-search trigger on the left and
 * the account avatar (which opens Settings) on the right. On desktop the
 * sidebar toggle lives in the sidebar itself; on mobile the sidebar is an
 * off-canvas drawer, so the header carries a trigger to open it (hidden at
 * md and up). The current page is signalled by the sidebar's active item plus
 * the page's own heading, so the header carries no title. The search button
 * keeps `data-slot="command-bar"` as a layout contract.
 */
export const CommandBarSlot = ({
  onSearchClick,
  onSettingsClick,
}: CommandBarSlotProps): ReactElement => (
  <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
    <SidebarTrigger className="md:hidden" />
    <button
      type="button"
      data-slot="command-bar"
      aria-label="Search Halero"
      onClick={onSearchClick}
      className="flex h-7 w-full max-w-xs cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <span className="truncate">Search Halero...</span>
      <kbd className="pointer-events-none ml-auto rounded-sm border px-1 font-sans text-[10px] leading-4 text-muted-foreground">
        ⌘K
      </kbd>
    </button>
    <div className="ml-auto">
      <HeaderAccount onOpen={onSettingsClick} />
    </div>
  </header>
);
