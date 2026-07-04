import {
  Button,
  PanelLeftClose,
  PanelLeftOpen,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useSidebar,
} from "@halero/ui";
import type { ReactElement } from "react";

export interface CommandBarSlotProps {
  /** Opens the command palette; the shell owns the open state. */
  readonly onSearchClick: () => void;
  /** Opens Settings; Settings lives behind the avatar, not the sidebar. */
  readonly onSettingsClick: () => void;
  /** The current page's title, shown beside the collapse toggle. */
  readonly title?: string;
}

/** Collapse toggle whose glyph points the direction the rail will move. */
const SidebarToggle = (): ReactElement => {
  const { toggleSidebar, state } = useSidebar();
  const Icon = state === "collapsed" ? PanelLeftOpen : PanelLeftClose;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Toggle sidebar"
          onClick={toggleSidebar}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Toggle sidebar ⌘B</TooltipContent>
    </Tooltip>
  );
};

/**
 * The app header: the sidebar collapse toggle and current page title on the
 * left, the universal-search trigger and the account avatar (which opens
 * Settings) on the right. The search button keeps `data-slot="command-bar"`
 * as a layout contract as its surface evolves.
 */
export const CommandBarSlot = ({
  onSearchClick,
  onSettingsClick,
  title,
}: CommandBarSlotProps): ReactElement => (
  <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-card px-3">
    <SidebarToggle />
    {title ? (
      <>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <span className="text-sm font-medium">{title}</span>
      </>
    ) : null}
    <button
      type="button"
      data-slot="command-bar"
      aria-label="Search Halero"
      onClick={onSearchClick}
      className="ml-auto flex h-7 w-full max-w-xs cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
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
      className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md bg-primary/10 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
    >
      H
    </button>
  </header>
);
