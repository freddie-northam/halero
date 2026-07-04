import {
  CalendarDays,
  Circle,
  House,
  ListTodo,
  LogOut,
  type LucideIcon,
  Settings,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  StickyNote,
} from "@halero/ui";
import type { ReactElement } from "react";

/** One nav rail entry; the registry's NavContribution satisfies it. */
export interface SidebarNavItem {
  readonly label: string;
  readonly path: string;
  /** Semantic icon key resolved through NAV_ICONS; unknown keys fall back. */
  readonly icon?: string;
  /** "secondary" pins the item to the footer; anything else stays primary. */
  readonly group?: "primary" | "secondary";
}

export interface AppSidebarProps {
  readonly items: readonly SidebarNavItem[];
  readonly activePath: string;
  readonly onNavigate: (path: string) => void;
  readonly onLogout: () => void;
  readonly logoutPending?: boolean;
}

/** Maps a nav item's semantic icon key to its rail glyph. */
const NAV_ICONS: Record<string, LucideIcon> = {
  home: House,
  calendar: CalendarDays,
  tasks: ListTodo,
  notes: StickyNote,
  settings: Settings,
};

// Coral active state that stays legible: a faint coral tint plus a coral icon
// signal "active"; the label keeps the shadcn near-black foreground, because
// coral text on white fails WCAG AA contrast.
const ACTIVE_ITEM =
  "data-[active=true]:bg-primary/10 data-[active=true]:hover:bg-primary/10 [&[data-active=true]>svg]:text-primary";

const NavButton = ({
  item,
  activePath,
  onNavigate,
}: {
  readonly item: SidebarNavItem;
  readonly activePath: string;
  readonly onNavigate: (path: string) => void;
}): ReactElement => {
  const Icon = NAV_ICONS[item.icon ?? ""] ?? Circle;
  const active = item.path === activePath;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={active}
        aria-current={active ? "page" : undefined}
        tooltip={item.label}
        className={ACTIVE_ITEM}
        onClick={() => onNavigate(item.path)}
      >
        <Icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

/**
 * Halero's app sidebar composed from the shadcn sidebar family. It is an
 * icon rail that collapses (collapsible="icon"): expanded shows glyph plus
 * label, collapsed shows glyph-only with the label as a tooltip. Primary
 * items live in the content area; group "secondary" items (Settings) pin to
 * the footer above Sign out. Items come from the web module registry; the
 * sidebar itself knows no module names.
 */
export const AppSidebar = ({
  items,
  activePath,
  onNavigate,
  onLogout,
  logoutPending = false,
}: AppSidebarProps): ReactElement => {
  const primary = items.filter((item) => item.group !== "secondary");
  const secondary = items.filter((item) => item.group === "secondary");
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-11 shrink-0 flex-row items-center border-b px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <img
          src="/brand/halero-logo.png"
          alt="Halero"
          className="h-5 w-auto group-data-[collapsible=icon]:hidden"
        />
        <img
          src="/brand/halero-mark.png"
          alt="Halero"
          className="hidden size-6 group-data-[collapsible=icon]:block"
        />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Primary" className="p-2">
          <SidebarMenu>
            {primary.map((item) => (
              <NavButton
                key={item.path}
                item={item}
                activePath={activePath}
                onNavigate={onNavigate}
              />
            ))}
          </SidebarMenu>
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          {secondary.map((item) => (
            <NavButton
              key={item.path}
              item={item}
              activePath={activePath}
              onNavigate={onNavigate}
            />
          ))}
          <SidebarMenuItem>
            <SidebarMenuButton
              type="button"
              tooltip="Sign out"
              onClick={onLogout}
              disabled={logoutPending}
            >
              <LogOut />
              <span>{logoutPending ? "Signing out" : "Sign out"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
