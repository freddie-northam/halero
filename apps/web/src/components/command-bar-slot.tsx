import { SidebarTrigger } from "@halero/ui";
import type { ReactElement } from "react";
import { HeaderAccount } from "./header-account";

export interface CommandBarSlotProps {
  /** Opens Settings; Settings lives behind the avatar, not the sidebar. */
  readonly onSettingsClick: () => void;
}

/**
 * The top bar, on the outer warm frame above the white content panel
 * (Wispr-style): it carries only the account avatar, which opens Settings.
 * Search lives at the top of the sidebar now, so nothing else sits here. On
 * mobile the sidebar is an off-canvas drawer, so the bar keeps a trigger to
 * open it (hidden at md and up).
 */
export const CommandBarSlot = ({
  onSettingsClick,
}: CommandBarSlotProps): ReactElement => (
  <header className="flex h-12 shrink-0 items-center px-4">
    <SidebarTrigger className="md:hidden" />
    <div className="ml-auto">
      <HeaderAccount onOpen={onSettingsClick} />
    </div>
  </header>
);
