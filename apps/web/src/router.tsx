import type {
  CommandContribution,
  EntityLink,
  EntityLinkContribution,
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
import { buildCommands, buildEntityLinks, buildNav } from "./registry";
import { LoginScreen } from "./routes/login";
import {
  isSettingsSection,
  SettingsScreen,
  type SettingsSection,
} from "./routes/settings";
import { SetupScreen } from "./routes/setup";
import { ShellScreen } from "./routes/shell";

export interface RouterContext {
  readonly api: HaleroApi;
  /** Nav entries from the registry; the shell reads them per route. */
  readonly nav: readonly NavContribution[];
  /** Entity links from the registry, for the shell's command palette. */
  readonly entityLinks: ReadonlyMap<string, EntityLinkContribution>;
  /** Module commands from the registry, for the palette's Commands group. */
  readonly commands: readonly CommandContribution[];
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
});

const PendingScreen = (): ReactElement => (
  <div className="flex min-h-dvh items-center justify-center bg-background">
    <Loader2
      aria-hidden="true"
      className="size-4 animate-spin text-muted-foreground"
    />
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
    entityLinks: router.options.context.entityLinks,
    commands: router.options.context.commands,
    onNavigate: (path: string) => {
      void router.navigate({ to: path });
    },
    // Search hits carry module-built links: a path plus search params.
    onOpenLink: (link: EntityLink) => {
      void router.navigate({ to: link.path, search: link.search ?? {} });
    },
    onLoggedOut: () => {
      void router.navigate({ to: "/login" });
    },
  };
};

const SettingsBody = ({
  section,
  search,
}: {
  readonly section: SettingsSection;
  readonly search: SettingsSearch;
}): ReactElement => (
  <ShellScreen {...useShellProps("/settings")}>
    <SettingsScreen
      section={section}
      connected={search.connected ?? false}
      errorCode={search.error ?? null}
      errorConnector={search.connector ?? null}
    />
  </ShellScreen>
);

const SettingsIndexRoute = (): ReactElement => (
  <SettingsBody section="profile" search={settingsRoute.useSearch()} />
);

const SettingsSectionRoute = (): ReactElement => {
  const { section } = settingsSectionRoute.useParams();
  return (
    <SettingsBody
      section={isSettingsSection(section) ? section : "profile"}
      search={settingsSectionRoute.useSearch()}
    />
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
  /** Which connector an OAuth callback error belongs to. */
  readonly connector?: string;
}

// The OAuth callback lands on /settings/integrations with ?connected=1 or
// ?error=<code>&connector=<id>; anything unexpected is dropped.
const validateSettingsSearch = (
  search: Record<string, unknown>,
): SettingsSearch => ({
  ...(search.connected === "1" || search.connected === 1
    ? { connected: true }
    : {}),
  ...(typeof search.error === "string" && search.error !== ""
    ? { error: search.error }
    : {}),
  ...(typeof search.connector === "string" && search.connector !== ""
    ? { connector: search.connector }
    : {}),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  validateSearch: validateSettingsSearch,
  beforeLoad: ({ context }) => guardAuthenticated(context.api),
  component: SettingsIndexRoute,
});

const settingsSectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/$section",
  validateSearch: validateSettingsSearch,
  beforeLoad: ({ context }) => guardAuthenticated(context.api),
  component: SettingsSectionRoute,
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
    settingsSectionRoute,
    ...moduleRoutes,
  ]);
  return createRouter({
    routeTree,
    ...(history === undefined ? {} : { history }),
    context: {
      api,
      nav: buildNav(webModules),
      // Built here so a duplicate entity-link kind or command id fails
      // at startup, not when the palette first routes a hit or runs a
      // command.
      entityLinks: buildEntityLinks(webModules),
      commands: buildCommands(webModules),
    },
    defaultPendingComponent: PendingScreen,
    defaultErrorComponent: ErrorScreen,
  });
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
