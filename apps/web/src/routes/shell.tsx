import { useMutation } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { CommandBarSlot } from "../components/command-bar-slot";
import { type NavItem, Sidebar } from "../components/sidebar";
import { useApi } from "../lib/api-context";

export interface ShellScreenProps {
  readonly onLoggedOut: () => void;
  readonly activeNav: NavItem;
  readonly onNavigate: (item: NavItem) => void;
  readonly children?: ReactNode;
}

const Placeholder = (): ReactElement => (
  <div className="flex h-full items-center justify-center">
    <div className="px-4 text-center">
      <p className="text-base font-medium">Nothing here yet.</p>
      <p className="mt-1 text-sm text-text-muted">
        Connect Google Calendar in Settings to bring your events in.
      </p>
    </div>
  </div>
);

export const ShellScreen = ({
  onLoggedOut,
  activeNav,
  onNavigate,
  children,
}: ShellScreenProps): ReactElement => {
  const api = useApi();
  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: onLoggedOut,
  });

  return (
    <div className="flex h-dvh bg-bg text-text">
      <Sidebar
        active={activeNav}
        onNavigate={onNavigate}
        onLogout={() => logout.mutate()}
        logoutPending={logout.isPending}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <CommandBarSlot />
        <main className="flex-1 overflow-auto">
          {children ?? <Placeholder />}
        </main>
      </div>
    </div>
  );
};
