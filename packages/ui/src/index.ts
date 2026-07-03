/*
 * Public surface of @halero/ui: the vendored shadcn/ui components plus the
 * cn class combiner. Apps import from this index only; deep imports into
 * src/components/ui are not part of the contract.
 */

// Sanctioned lucide icons: Loader2 with animate-spin is the busy
// indicator; the chevrons drive prev/next navigation; Pencil is the
// edit affordance (opens the task detail sheet); Repeat marks recurring
// calendar items; StickyNote marks tasks carrying notes; X is the inline
// delete/dismiss affordance. The Integrations marketplace adds: Check
// (connected state), Search (marketplace filter), ExternalLink (docs/OAuth
// links), AlertCircle (error/warning state), ChevronDown (collapsible
// disclosure), Plug (connector affordance/fallback), Trash2 (disconnect).
export {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Pencil,
  Plug,
  Repeat,
  Search,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
export { ConnectorLogo } from "./brand/connector-logo";
export { InterestedAvatars } from "./brand/interested-avatars";
export { DatePicker } from "./components/date-picker";
export { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
export { Badge, badgeVariants } from "./components/ui/badge";
export { Button, buttonVariants } from "./components/ui/button";
export { Calendar, CalendarDayButton } from "./components/ui/calendar";
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
export { Checkbox } from "./components/ui/checkbox";
export {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./components/ui/collapsible";
export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "./components/ui/command";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
export { Input } from "./components/ui/input";
export { Label } from "./components/ui/label";
export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "./components/ui/popover";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
export { Separator } from "./components/ui/separator";
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./components/ui/sheet";
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./components/ui/sidebar";
export { Skeleton } from "./components/ui/skeleton";
export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./components/ui/tabs";
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";
export { cn } from "./lib/utils";
