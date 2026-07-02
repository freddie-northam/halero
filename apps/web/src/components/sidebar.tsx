import {
  Button,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@halero/ui";
import type { ReactElement } from "react";

/** One nav rail entry; the registry's NavContribution satisfies it. */
export interface SidebarNavItem {
  readonly label: string;
  readonly path: string;
}

export interface AppSidebarProps {
  readonly items: readonly SidebarNavItem[];
  readonly activePath: string;
  readonly onNavigate: (path: string) => void;
  readonly onLogout: () => void;
  readonly logoutPending?: boolean;
}

/**
 * Halero's app sidebar composed from the shadcn sidebar family. It renders
 * as a static rail (collapsible="none"): the shell has no trigger and the
 * navigation is always visible, as before the shadcn adoption. Items come
 * from the web module registry; the sidebar itself knows no module names.
 */
export const AppSidebar = ({
  items,
  activePath,
  onNavigate,
  onLogout,
  logoutPending = false,
}: AppSidebarProps): ReactElement => (
  <Sidebar collapsible="none" className="shrink-0 border-r">
    <SidebarHeader className="h-11 shrink-0 justify-center border-b px-4">
      <span className="text-sm font-semibold tracking-tight">Halero</span>
    </SidebarHeader>
    <SidebarContent>
      <nav aria-label="Primary" className="p-2">
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.path}>
              <SidebarMenuButton
                type="button"
                isActive={item.path === activePath}
                aria-current={item.path === activePath ? "page" : undefined}
                onClick={() => onNavigate(item.path)}
              >
                {item.label}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </nav>
    </SidebarContent>
    <SidebarFooter className="border-t p-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onLogout}
        disabled={logoutPending}
      >
        {logoutPending ? "Signing out" : "Sign out"}
      </Button>
    </SidebarFooter>
  </Sidebar>
);
