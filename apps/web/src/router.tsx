import { Spinner } from "@halero/ui";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import type { HaleroApi } from "./lib/api";
import { readableError } from "./lib/errors";
import { guardEntry } from "./lib/guards";
import { LoginScreen } from "./routes/login";
import { SetupScreen } from "./routes/setup";
import { ShellScreen } from "./routes/shell";

export interface RouterContext {
  readonly api: HaleroApi;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
});

const PendingScreen = (): ReactElement => (
  <div className="flex min-h-dvh items-center justify-center bg-bg">
    <Spinner />
  </div>
);

const ErrorScreen = ({ error }: { readonly error: Error }): ReactElement => (
  <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
    <div className="max-w-sm text-center">
      <p className="text-base font-medium">
        Could not reach your Halero server.
      </p>
      <p className="mt-1 text-sm text-text-muted">{readableError(error)}</p>
    </div>
  </div>
);

const ShellRoute = (): ReactElement => {
  const router = useRouter();
  return (
    <ShellScreen
      onLoggedOut={() => {
        void router.navigate({ to: "/login" });
      }}
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

const routeTree = rootRoute.addChildren([indexRoute, loginRoute, setupRoute]);

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
