import type {
  NavContribution,
  PageContribution,
  WebModule,
} from "@halero/module-sdk/web";
import { Loader2 } from "@halero/ui";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
  useRouter,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import type { HaleroApi } from "./lib/api";
import { readableError } from "./lib/errors";
import { guardAuthenticated, guardEntry } from "./lib/guards";
import { buildNav } from "./registry";
import { LoginScreen } from "./routes/login";
import { SettingsScreen } from "./routes/settings";
import { SetupScreen } from "./routes/setup";
import { ShellScreen } from "./routes/shell";

export interface RouterContext {
  readonly api: HaleroApi;
  /** Nav entries from the registry; the shell reads them per route. */
  readonly nav: readonly NavContribution[];
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

/** Shared shell wiring: registry nav, path navigation, logout to /login. */
const useShellProps = (activePath: string) => {
  const router = useRouter();
  return {
    activePath,
    nav: router.options.context.nav,
    onNavigate: (path: string) => {
      void router.navigate({ to: path });
    },
    onLoggedOut: () => {
      void router.navigate({ to: "/login" });
    },
  };
};

const SettingsRoute = (): ReactElement => {
  const search = settingsRoute.useSearch();
  return (
    <ShellScreen {...useShellProps("/settings")}>
      <SettingsScreen
        connected={search.connected ?? false}
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
  /** Optional so plain links to /settings need no query string. */
  readonly connected?: boolean;
  readonly error?: string;
}

// The OAuth callback lands here with ?connected=1 or ?error=<code>; anything
// unexpected in the query string is dropped.
const validateSettingsSearch = (
  search: Record<string, unknown>,
): SettingsSearch => ({
  ...(search.connected === "1" || search.connected === 1
    ? { connected: true }
    : {}),
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

/** Wraps a module page in the signed-in shell with its path active. */
const createModulePageComponent = (page: PageContribution) => {
  const PageBody = page.component;
  const ModulePageRoute = (): ReactElement => (
    <ShellScreen {...useShellProps(page.path)}>
      <PageBody />
    </ShellScreen>
  );
  return ModulePageRoute;
};

/** Module pages live inside the signed-in shell, so they share its guard. */
const createModulePageRoute = (page: PageContribution) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: page.path,
    // Module-owned search-param normalization (e.g. calendar view/date).
    validateSearch: page.validateSearch,
    beforeLoad: ({ context }) => guardAuthenticated(context.api),
    component: createModulePageComponent(page),
  });

export const createAppRouter = (
  api: HaleroApi,
  webModules: readonly WebModule[],
  /** Tests pass a memory history; the app uses the browser default. */
  history?: RouterHistory,
) => {
  const moduleRoutes = webModules.flatMap((module) =>
    (module.pages ?? []).map(createModulePageRoute),
  );
  // The index route ("/") comes from the today module's page
  // contribution, guarded like every other module page.
  const routeTree = rootRoute.addChildren([
    loginRoute,
    setupRoute,
    settingsRoute,
    ...moduleRoutes,
  ]);
  return createRouter({
    routeTree,
    ...(history === undefined ? {} : { history }),
    context: { api, nav: buildNav(webModules) },
    defaultPendingComponent: PendingScreen,
    defaultErrorComponent: ErrorScreen,
  });
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
