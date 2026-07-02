import { Button } from "@halero/ui";
import type { ReactElement } from "react";

const NAV_ITEMS = ["Today", "Calendar", "Settings"] as const;

export type NavItem = (typeof NAV_ITEMS)[number];

export interface SidebarProps {
  readonly active: NavItem;
  readonly onNavigate: (item: NavItem) => void;
  readonly onLogout: () => void;
  readonly logoutPending?: boolean;
}

export const Sidebar = ({
  active,
  onNavigate,
  onLogout,
  logoutPending = false,
}: SidebarProps): ReactElement => {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-11 shrink-0 items-center border-b border-border px-4 text-sm font-semibold tracking-tight">
        Halero
      </div>
      <nav aria-label="Primary" className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <li key={item}>
              <button
                type="button"
                aria-current={item === active ? "page" : undefined}
                onClick={() => onNavigate(item)}
                className={`w-full rounded-control px-2.5 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                  item === active
                    ? "bg-stone-100 font-medium text-text"
                    : "text-text-muted hover:bg-stone-50 hover:text-text"
                }`}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="shrink-0 border-t border-border p-2">
        <Button
          size="sm"
          className="w-full"
          onClick={onLogout}
          disabled={logoutPending}
        >
          {logoutPending ? "Signing out" : "Sign out"}
        </Button>
      </div>
    </aside>
  );
};
