import {
  CalendarDays,
  Circle,
  CircleHelp,
  Gift,
  House,
  ListTodo,
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useSidebar,
} from "@halero/ui";
import type { ReactElement } from "react";

/** The Halero repo: where "Refer a friend" and "Help" point. */
const REPO_URL = "https://github.com/freddie-northam/halero";

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
}

/** Maps a nav item's semantic icon key to its rail glyph. */
const NAV_ICONS: Record<string, LucideIcon> = {
  home: House,
  calendar: CalendarDays,
  tasks: ListTodo,
  notes: StickyNote,
  settings: Settings,
};

// Roomy, premium nav rows (larger than the product's dense 13px scale, since
// the sidebar is chrome): taller, 15px labels, bigger glyphs.
const NAV_ITEM = "h-9 gap-3 rounded-lg text-[15px] [&>svg]:size-5";

// Coral active state that stays legible: a faint coral tint plus a coral icon
// signal "active"; the label keeps the near-black foreground, because coral
// text on white fails WCAG AA contrast.
const ACTIVE_ITEM =
  "data-[active=true]:bg-primary/10 data-[active=true]:hover:bg-primary/10 [&[data-active=true]>svg]:text-primary";

/** Collapse toggle, pinned at the sidebar's top-left above the logo. */
const SidebarToggle = (): ReactElement => {
  const { toggleSidebar, state } = useSidebar();
  const Icon = state === "collapsed" ? PanelLeftOpen : PanelLeftClose;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Toggle sidebar"
          onClick={toggleSidebar}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground [&>svg]:size-[18px]"
        >
          <Icon />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">Toggle sidebar ⌘B</TooltipContent>
    </Tooltip>
  );
};

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
        className={`${NAV_ITEM} ${ACTIVE_ITEM}`}
        onClick={() => onNavigate(item.path)}
      >
        <Icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

/** An external link styled as a footer nav row (Refer a friend, Help). */
const ExternalNavItem = ({
  label,
  href,
  icon: Icon,
}: {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
}): ReactElement => (
  <SidebarMenuItem>
    <SidebarMenuButton asChild tooltip={label} className={NAV_ITEM}>
      <a href={href} target="_blank" rel="noreferrer noopener">
        <Icon />
        <span>{label}</span>
      </a>
    </SidebarMenuButton>
  </SidebarMenuItem>
);

/**
 * Halero's app sidebar, composed from the shadcn sidebar family as an inset
 * rail: the warm frame holds the sidebar and the content floats as a white
 * rounded panel beside it. The collapse toggle sits at the top-left above the
 * logo. Primary items live in the content area; the footer holds Refer a
 * friend, Settings, then Help (sign out lives inside Settings). Items come
 * from the web module registry; the sidebar knows no module names.
 */
export const AppSidebar = ({
  items,
  activePath,
  onNavigate,
}: AppSidebarProps): ReactElement => {
  const primary = items.filter((item) => item.group !== "secondary");
  const secondary = items.filter((item) => item.group === "secondary");
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="gap-3 p-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-2">
        <SidebarToggle />
        <img
          src="/brand/halero-logo.png"
          alt="Halero"
          className="h-7 w-auto group-data-[collapsible=icon]:hidden"
        />
        <img
          src="/brand/halero-mark.png"
          alt="Halero"
          className="hidden size-7 group-data-[collapsible=icon]:block"
        />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Primary" className="p-2">
          <SidebarMenu className="gap-1">
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
      <SidebarFooter className="border-t border-border/60 p-2">
        <SidebarMenu className="gap-1">
          <ExternalNavItem label="Refer a friend" href={REPO_URL} icon={Gift} />
          {secondary.map((item) => (
            <NavButton
              key={item.path}
              item={item}
              activePath={activePath}
              onNavigate={onNavigate}
            />
          ))}
          <ExternalNavItem
            label="Help"
            href={`${REPO_URL}#readme`}
            icon={CircleHelp}
          />
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
