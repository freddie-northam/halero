// The compile-time module registry: the ONE place the server names the
// modules this build ships. Core resolves entity kinds, satellite
// writers, upcasts, and module routers through it and never imports
// module code anywhere else. A runtime loader can replace this array
// later without touching any module.

import { calendarServerModule } from "@halero/module-calendar/server";
import {
  buildKindRegistry,
  type KindRegistry,
  type ModuleRequestContext,
  type ServerModule,
} from "@halero/module-sdk/server";
import type { TrpcContext } from "./trpc/context";
import { router } from "./trpc/init";

/** The modules this build ships with. */
export const serverModules: readonly ServerModule[] = [calendarServerModule];

/**
 * Entity kind index, built and validated at boot. A duplicate module id,
 * a duplicate kind, or a malformed manifest throws a readable error here
 * before the server can start.
 */
export const kindRegistry: KindRegistry = buildKindRegistry(serverModules);

/**
 * Module routers, mounted under modules.<id>.*. The keys are written out
 * so tRPC keeps full procedure types for the web client; the test suite
 * pins each key to its module's manifest id.
 */
export const modulesRouter = router({
  calendar: calendarServerModule.router,
});

/**
 * Compile-time proof that the host's tRPC context satisfies what module
 * procedures were built against. If TrpcContext ever loses a field the
 * module SDK guarantees, this alias stops compiling.
 */
export type HostContextServesModules = TrpcContext extends ModuleRequestContext
  ? true
  : never;
export const hostContextServesModules: HostContextServesModules = true;
