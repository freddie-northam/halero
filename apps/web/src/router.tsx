import { Loader2 } from "@halero/ui";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import type { NavItem } from "./components/sidebar";
import type { HaleroApi } from "./lib/api";
import { readableError } from "./lib/errors";
import { guardAuthenticated, guardEntry } from "./lib/guards";
import { CalendarScreen } from "./routes/calendar";
import { LoginScreen } from "./routes/login";
import { SettingsScreen } from "./routes/settings";
import { SetupScreen } from "./routes/setup";
import { ShellScreen } from "./routes/shell";

export interface RouterContext {
  readonly api: HaleroApi;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
});

const PendingScreen = (): ReactElement => (
  <div className="flex min-h-dvh items-center justify-center bg-background">
    <Loader2 className="size-4 animate-spin text-muted-foreground" />
  </div>
);

const ErrorScreen = ({ error }: { readonly error: Error }): ReactElement => (
  <div className="flex min-h-dvh items-center justify-center bg-background px-4">
    <div className="max-w-sm text-center">
      <p className="text-base font-medium">
        Could not reach your Halero server.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {readableError(error)}
      </p>
    </div>
  </div>
);

// The Today page does not exist yet; it lands on the home placeholder
// until its module arrives.
const NAV_ROUTES: Record<NavItem, string> = {
  Today: "/",
  Calendar: "/calendar",
  Settings: "/settings",
};

/** Shared shell wiring: nav items map to routes, logout returns to /login. */
const useShellProps = (activeNav: NavItem) => {
  const router = useRouter();
  return {
    activeNav,
    onNavigate: (item: NavItem) => {
      void router.navigate({ to: NAV_ROUTES[item] });
    },
    onLoggedOut: () => {
      void router.navigate({ to: "/login" });
    },
  };
};

const ShellRoute = (): ReactElement => (
  <ShellScreen {...useShellProps("Today")} />
);

const CalendarRoute = (): ReactElement => (
  <ShellScreen {...useShellProps("Calendar")}>
    <CalendarScreen />
  </ShellScreen>
);

const SettingsRoute = (): ReactElement => {
  const search = settingsRoute.useSearch();
  return (
    <ShellScreen {...useShellProps("Settings")}>
      <SettingsScreen
        connected={search.connected}
        errorCode={search.error ?? null}
      />
    </ShellScreen>
  );
};

const LoginRoute = (): ReactElement => {
  const router = useRouter();
  return (
    <LoginScreen
      onSuccess={() => {
        void router.navigate({ to: "/" });
      }}
    />
  );
};

const SetupRoute = (): ReactElement => {
  const router = useRouter();
  return (
    <SetupScreen
      onSuccess={() => {
        void router.navigate({ to: "/" });
      }}
    />
  );
};

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: ({ context }) => guardEntry(context.api, "/"),
  component: ShellRoute,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: ({ context }) => guardEntry(context.api, "/login"),
  component: LoginRoute,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  beforeLoad: ({ context }) => guardEntry(context.api, "/setup"),
  component: SetupRoute,
});

interface SettingsSearch {
  readonly connected: boolean;
  readonly error?: string;
}

// The OAuth callback lands here with ?connected=1 or ?error=<code>; anything
// unexpected in the query string is dropped.
const validateSettingsSearch = (
  search: Record<string, unknown>,
): SettingsSearch => ({
  connected: search.connected === "1" || search.connected === 1,
  ...(typeof search.error === "string" && search.error !== ""
    ? { error: search.error }
    : {}),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  validateSearch: validateSettingsSearch,
  beforeLoad: ({ context }) => guardAuthenticated(context.api),
  component: SettingsRoute,
});

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/calendar",
  beforeLoad: ({ context }) => guardAuthenticated(context.api),
  component: CalendarRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  setupRoute,
  settingsRoute,
  calendarRoute,
]);

export const createAppRouter = (api: HaleroApi) =>
  createRouter({
    routeTree,
    context: { api },
    defaultPendingComponent: PendingScreen,
    defaultErrorComponent: ErrorScreen,
  });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
