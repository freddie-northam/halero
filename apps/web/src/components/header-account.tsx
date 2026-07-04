// The header's account control: a small coral avatar showing the owner's
// initial (from the display name), opening Settings on click. Sign out lives
// inside Settings, so this is just the entry point to it.

import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApi } from "../lib/api-context";

const initialFor = (name: string | null | undefined): string => {
  const first = name?.trim().charAt(0) ?? "";
  return first === "" ? "H" : first.toUpperCase();
};

export interface HeaderAccountProps {
  /** Opens Settings (where sign out and account details live). */
  readonly onOpen: () => void;
}

export const HeaderAccount = ({ onOpen }: HeaderAccountProps): ReactElement => {
  const api = useApi();
  const status = useQuery({
    queryKey: ["system-status"],
    queryFn: () => api.systemStatus(),
  });
  const name = status.data?.displayName ?? null;
  return (
    <button
      type="button"
      aria-label={name ? `Account: ${name}` : "Account"}
      onClick={onOpen}
      className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
    >
      {initialFor(name)}
    </button>
  );
};
