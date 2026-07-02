import { useMutation } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { CommandBarSlot } from "../components/command-bar-slot";
import { Sidebar } from "../components/sidebar";
import { useApi } from "../lib/api-context";

export interface ShellScreenProps {
  readonly onLoggedOut: () => void;
}

export const ShellScreen = ({
  onLoggedOut,
}: ShellScreenProps): ReactElement => {
  const api = useApi();
  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: onLoggedOut,
  });

  return (
    <div className="flex h-dvh bg-bg text-text">
      <Sidebar
        onLogout={() => logout.mutate()}
        logoutPending={logout.isPending}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <CommandBarSlot />
        <main className="flex flex-1 items-center justify-center overflow-auto">
          <div className="px-4 text-center">
            <p className="text-base font-medium">Nothing here yet.</p>
            <p className="mt-1 text-sm text-text-muted">
              Connect Google Calendar in an upcoming step.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
};
