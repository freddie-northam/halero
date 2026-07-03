import type {
  CommandContribution,
  EntityLink,
  EntityLinkContribution,
} from "@halero/module-sdk/web";
import { SidebarInset, SidebarProvider } from "@halero/ui";
import { useMutation } from "@tanstack/react-query";
import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useState,
} from "react";
import { CommandBarSlot } from "../components/command-bar-slot";
import { CommandPalette } from "../components/command-palette";
import { AppSidebar, type SidebarNavItem } from "../components/sidebar";
import { useApi } from "../lib/api-context";

export interface ShellScreenProps {
  readonly onLoggedOut: () => void;
  /** Nav entries from the web module registry, already sorted. */
  readonly nav: readonly SidebarNavItem[];
  readonly activePath: string;
  readonly onNavigate: (path: string) => void;
  /** The entity-link registry built at boot, for the command palette. */
  readonly entityLinks: ReadonlyMap<string, EntityLinkContribution>;
  /** Module commands built at boot, for the palette's Commands group. */
  readonly commands: readonly CommandContribution[];
  /** Navigates to a search hit's or command result's link. */
  readonly onOpenLink: (link: EntityLink) => void;
  /** The routed page; every route brings its own (Today owns "/"). */
  readonly children: ReactNode;
}

// 14rem matches the pre-shadcn 224px rail width.
const SHELL_STYLE = { "--sidebar-width": "14rem" } as CSSProperties;

export const ShellScreen = ({
  onLoggedOut,
  nav,
  activePath,
  onNavigate,
  entityLinks,
  commands,
  onOpenLink,
  children,
}: ShellScreenProps): ReactElement => {
  const api = useApi();
  const [searchOpen, setSearchOpen] = useState(false);
  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: onLoggedOut,
  });

  return (
    <SidebarProvider className="h-dvh" style={SHELL_STYLE}>
      <AppSidebar
        items={nav}
        activePath={activePath}
        onNavigate={onNavigate}
        onLogout={() => logout.mutate()}
        logoutPending={logout.isPending}
      />
      <SidebarInset className="min-w-0">
        <CommandBarSlot onSearchClick={() => setSearchOpen(true)} />
        <div className="flex-1 overflow-auto">{children}</div>
      </SidebarInset>
      <CommandPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        entityLinks={entityLinks}
        commands={commands}
        onOpenLink={onOpenLink}
      />
    </SidebarProvider>
  );
};
