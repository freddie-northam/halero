import { SidebarInset, SidebarProvider } from "@halero/ui";
import { useMutation } from "@tanstack/react-query";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { CommandBarSlot } from "../components/command-bar-slot";
import { AppSidebar, type SidebarNavItem } from "../components/sidebar";
import { useApi } from "../lib/api-context";

export interface ShellScreenProps {
  readonly onLoggedOut: () => void;
  /** Nav entries from the web module registry, already sorted. */
  readonly nav: readonly SidebarNavItem[];
  readonly activePath: string;
  readonly onNavigate: (path: string) => void;
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
  children,
}: ShellScreenProps): ReactElement => {
  const api = useApi();
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
        <CommandBarSlot />
        <div className="flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
};
