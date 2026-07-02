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
  readonly children?: ReactNode;
}

const Placeholder = (): ReactElement => (
  <div className="flex h-full items-center justify-center">
    <div className="px-4 text-center">
      <p className="text-base font-medium">Nothing here yet.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect Google Calendar in Settings to bring your events in.
      </p>
    </div>
  </div>
);

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
        <div className="flex-1 overflow-auto">
          {children ?? <Placeholder />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};
