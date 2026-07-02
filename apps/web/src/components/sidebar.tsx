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

const NAV_ITEMS = ["Today", "Calendar", "Settings"] as const;

export type NavItem = (typeof NAV_ITEMS)[number];

export interface AppSidebarProps {
  readonly active: NavItem;
  readonly onNavigate: (item: NavItem) => void;
  readonly onLogout: () => void;
  readonly logoutPending?: boolean;
}

/**
 * Halero's app sidebar composed from the shadcn sidebar family. It renders
 * as a static rail (collapsible="none"): the shell has no trigger and the
 * navigation is always visible, as before the shadcn adoption.
 */
export const AppSidebar = ({
  active,
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
          {NAV_ITEMS.map((item) => (
            <SidebarMenuItem key={item}>
              <SidebarMenuButton
                type="button"
                isActive={item === active}
                aria-current={item === active ? "page" : undefined}
                onClick={() => onNavigate(item)}
              >
                {item}
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
