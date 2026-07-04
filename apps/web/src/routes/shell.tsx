import type {
  CommandContribution,
  EntityLink,
  EntityLinkContribution,
} from "@halero/module-sdk/web";
import {
  PageContainer,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useState,
} from "react";
import { CommandPalette } from "../components/command-palette";
import { AppSidebar, type SidebarNavItem } from "../components/sidebar";
import { useApi } from "../lib/api-context";

export interface ShellScreenProps {
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

/**
 * The nav entry a route belongs to. A module's detail routes (e.g. the
 * Notes editor at "/notes/$noteId") are not themselves nav entries, so an
 * exact match alone leaves them with no active item and no header title;
 * fall back to the deepest nav entry whose path is a segment-boundary
 * prefix of the active path. Root ("/") only ever matches exactly, since
 * it prefixes everything.
 */
export const navItemFor = (
  nav: readonly SidebarNavItem[],
  activePath: string,
): SidebarNavItem | undefined =>
  nav.find((item) => item.path === activePath) ??
  nav.find(
    (item) => item.path !== "/" && activePath.startsWith(`${item.path}/`),
  );

/**
 * The collapse choice the sidebar persisted in the `sidebar_state` cookie, so
 * it survives a reload. The vendored SidebarProvider writes the cookie but
 * defaults to open on mount, so the shell seeds `defaultOpen` from it.
 */
const readSidebarState = (): boolean => {
  if (typeof document === "undefined") return true;
  const match = document.cookie.match(/(?:^|;\s*)sidebar_state=(true|false)/);
  return match ? match[1] === "true" : true;
};

export const ShellScreen = ({
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
  const [defaultSidebarOpen] = useState(readSidebarState);
  const activeItem = navItemFor(nav, activePath);
  // The owner's name for the sidebar account row (present once signed in).
  const status = useQuery({
    queryKey: ["system-status"],
    queryFn: () => api.systemStatus(),
  });

  return (
    <SidebarProvider
      className="h-dvh"
      style={SHELL_STYLE}
      defaultOpen={defaultSidebarOpen}
    >
      <AppSidebar
        items={nav}
        activePath={activeItem?.path ?? activePath}
        onNavigate={onNavigate}
        onSearchClick={() => setSearchOpen(true)}
        accountName={status.data?.displayName ?? null}
      />
      {/* The routed content is the single white panel, floating in the warm
          inset frame with a uniform margin so its padding reads even on every
          side. A hairline border carries the edge; no shadow. Search and the
          account live in the sidebar, so on desktop there is no top bar. */}
      <SidebarInset className="min-w-0 overflow-hidden border bg-card md:peer-data-[variant=inset]:ml-2 md:peer-data-[variant=inset]:shadow-none">
        {/* Mobile only: the sidebar is an off-canvas drawer, so keep a trigger
            to open it. Hidden at md+, where the sidebar is always present. */}
        <div className="flex h-12 shrink-0 items-center px-4 md:hidden">
          <SidebarTrigger />
        </div>
        {/* PageContainer is the single width/padding authority: wrapping every
            routed page here means no page can set its own width. */}
        <div className="min-h-0 flex-1 overflow-auto">
          <PageContainer>{children}</PageContainer>
        </div>
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
