// The compile-time module registry: the ONE place the server names the
// modules this build ships. Core resolves entity kinds, satellite
// writers, upcasts, and module routers through it and never imports
// module code anywhere else. A runtime loader can replace this array
// later without touching any module.

import type { EntityStore } from "@halero/core";
import { calendarServerModule } from "@halero/module-calendar/server";
import { f1ServerModule } from "@halero/module-f1/server";
import { notesServerModule } from "@halero/module-notes/server";
import {
  buildKindRegistry,
  buildLinkKindRegistry,
  type KindRegistry,
  type LinkKindContribution,
  type LinkKindRegistry,
  type ModuleRequestContext,
  type ServerModule,
  type UserEntityStore,
} from "@halero/module-sdk/server";
import { tasksServerModule } from "@halero/module-tasks/server";
import type { TrpcContext } from "./trpc/context";
import { router } from "./trpc/init";

/** The modules this build ships with. */
export const serverModules: readonly ServerModule[] = [
  calendarServerModule,
  tasksServerModule,
  notesServerModule,
  f1ServerModule,
];

/**
 * Entity kind index, built and validated at boot. A duplicate module id,
 * a duplicate kind, or a malformed manifest throws a readable error here
 * before the server can start.
 */
export const kindRegistry: KindRegistry = buildKindRegistry(serverModules);

/**
 * Host-owned link kinds every build ships with. The generic, symmetric
 * "relates_to" lets a person connect any two items by hand; modules add
 * typed kinds (e.g. "task.blocks") through their own linkKinds.
 */
export const HOST_LINK_KINDS: readonly LinkKindContribution[] = [
  {
    kind: "relates_to",
    label: "Related to",
    from: "*",
    to: "*",
    symmetric: true,
  },
];

/**
 * The link-kind vocabulary the links router validates edges against,
 * built and validated at boot. A duplicate link-kind id (host or module)
 * throws a readable error here before the server can start.
 */
export const linkKindRegistry: LinkKindRegistry = buildLinkKindRegistry([
  ...HOST_LINK_KINDS,
  ...serverModules.flatMap((module) => module.linkKinds ?? []),
]);

/**
 * Module routers, mounted under modules.<id>.*. The keys are written out
 * so tRPC keeps full procedure types for the web client; the test suite
 * pins each key to its module's manifest id.
 */
export const modulesRouter = router({
  calendar: calendarServerModule.router,
  tasks: tasksServerModule.router,
  notes: notesServerModule.router,
  f1: f1ServerModule.router,
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

/**
 * Compile-time proof that core's EntityStore structurally provides the
 * user-entity capability the SDK promises modules. The SDK owns the
 * shape and core never imports it; this alias is where the two meet.
 */
export type CoreServesUserEntityStore = EntityStore extends UserEntityStore
  ? true
  : never;
export const coreServesUserEntityStore: CoreServesUserEntityStore = true;
