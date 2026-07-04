// The server side of the module contract: what a module contributes to a
// Halero host (entity kinds, satellite writers, upcasts, a tRPC router)
// and the registry validation a host runs at boot. Extracted from the
// working calendar code, so every shape here is one the host has needed.

import type { UpsertSyncOp } from "@halero/connector-sdk";
import type { HaleroDatabase } from "@halero/db";
import type { AnyTRPCRouter } from "@trpc/server";
import { z } from "zod";

/** The host's database handle as modules see it. */
export type ModuleDb = HaleroDatabase["db"];

/**
 * Writes one upserted item's kind-specific fields into the kind's
 * satellite table. Same shape the host's sync engine has always used;
 * it now arrives through the module registry instead of a hardcoded map.
 */
export type SatelliteWriter = (
  db: ModuleDb,
  entityId: string,
  op: UpsertSyncOp,
) => void;

/**
 * Upgrades a satellite payload one schema version step (n to n+1). Keyed
 * by the version it upgrades FROM in EntityKindContribution.upcasts.
 */
export type UpcastFn = (
  old: Record<string, unknown>,
) => Record<string, unknown>;

export interface EntityKindContribution {
  /** Stable kind id, e.g. "calendar.event". */
  readonly kind: string;
  /** The schema version this build stores rows at. */
  readonly schemaVersion: number;
  /**
   * Validates the satellite payload shape for the current version.
   * HOST-ENFORCED: the sync engine checks every upserted op's
   * post-upcast satellite payload against this schema before storing
   * anything; a mismatch fails the run readably and rolls the page
   * back. Ops without a satellite payload skip the check (spine-only
   * kinds are legal).
   */
  readonly schema: z.ZodType<unknown>;
  readonly upcasts?: Readonly<Record<number, UpcastFn>>;
  /** Omitted for spine-only kinds that keep no satellite table. */
  readonly satelliteWriter?: SatelliteWriter;
}

/**
 * A relationship kind an entity graph can hold, e.g. the built-in
 * symmetric "relates_to" or a typed "task.blocks". Endpoints are entity
 * kinds, or "*" for "any kind"; a host validates a link's endpoints
 * against these before storing an edge. Registered like entity kinds so
 * the graph stays a governed vocabulary, not a free-for-all string field.
 */
export interface LinkKindContribution {
  /** Stable link-kind id, e.g. "relates_to" or "task.blocks". */
  readonly kind: string;
  /** Forward-direction label shown on the from-side, e.g. "Blocks". */
  readonly label: string;
  /**
   * Reverse-direction label shown on the to-side, e.g. "Blocked by".
   * Omitted falls back to `label` (right for symmetric kinds).
   */
  readonly inverseLabel?: string;
  /** Allowed from-endpoint entity kind, or "*" for any. */
  readonly from: string;
  /** Allowed to-endpoint entity kind, or "*" for any. */
  readonly to: string;
  /**
   * True when A-rel-B implies B-rel-A (e.g. "relates_to"). Lets a host
   * present one undirected edge from either endpoint.
   */
  readonly symmetric?: boolean;
}

export interface ServerModule {
  /** Stable module id, e.g. "calendar". Also its tRPC mount name. */
  readonly id: string;
  /** The module package's own semver. */
  readonly version: string;
  readonly entityKinds?: readonly EntityKindContribution[];
  /** Relationship kinds this module contributes to the host's graph. */
  readonly linkKinds?: readonly LinkKindContribution[];
  /** Mounted by the host at modules.<id>.*. */
  readonly router?: AnyTRPCRouter;
}

/**
 * Identity helper that pins a module to the SDK's contract while
 * preserving the concrete type (so hosts keep full router types).
 */
export const defineServerModule = <M extends ServerModule>(module: M): M =>
  module;

export interface CreateUserEntityInput {
  readonly kind: string;
  readonly schemaVersion: number;
  readonly title?: string;
  readonly snippet?: string;
  readonly occurredStart?: number;
  readonly occurredEnd?: number;
}

/**
 * Omitted fields preserve their stored values; an explicit null clears
 * the nullable occurred fields.
 */
export interface UpdateUserEntityPatch {
  readonly title?: string;
  readonly snippet?: string;
  readonly occurredStart?: number | null;
  readonly occurredEnd?: number | null;
}

/**
 * The user-entity write capability a host guarantees to module
 * procedures. Defined structurally here so modules never import core;
 * core's EntityStore happens to satisfy it, and the host pins that with
 * a compile-time proof next to its registry.
 *
 * withTransaction lets a module bundle satellite writes with the spine
 * write atomically; every method also self-wraps, so single calls are
 * atomic on their own.
 */
export interface UserEntityStore {
  withTransaction<T>(fn: () => T): T;
  createUserEntity(input: CreateUserEntityInput): { entityId: string };
  updateUserEntity(id: string, patch: UpdateUserEntityPatch): void;
  deleteUserEntity(id: string): void;
}

/**
 * The request context a host guarantees to module procedures. The host's
 * own tRPC context must be a structural superset of this.
 */
export interface ModuleRequestContext {
  readonly db: ModuleDb;
  readonly now: () => number;
  /** Non-null once the visitor is signed in; modules guard on it. */
  readonly session: object | null;
  /** User-entity writes; connector-managed entities stay off limits. */
  readonly entities: UserEntityStore;
}

/** One registered entity kind, annotated with the module that owns it. */
export interface RegisteredEntityKind extends EntityKindContribution {
  readonly moduleId: string;
}

/**
 * Validated kind lookup. The private field makes the type nominal: a
 * hand-built map can never pass as one, so every kind registry a host
 * (or a test) hands the sync engine went through buildKindRegistry's
 * boot validation.
 */
class ValidatedKindRegistry {
  readonly #byKind: ReadonlyMap<string, RegisteredEntityKind>;

  constructor(byKind: ReadonlyMap<string, RegisteredEntityKind>) {
    this.#byKind = byKind;
  }

  get(kind: string): RegisteredEntityKind | undefined {
    return this.#byKind.get(kind);
  }
}

export type KindRegistry = ValidatedKindRegistry;

/** The structural half of a module manifest that zod can check. */
export const serverModuleManifestSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  entityKinds: z
    .array(
      z.object({
        kind: z.string().min(1),
        schemaVersion: z.number().int().positive(),
      }),
    )
    .optional(),
});

const MALFORMED_MODULE_MESSAGE =
  "A module could not be registered because its manifest is malformed. " +
  "Update or rebuild the module package.";

const duplicateModuleMessage = (id: string): string =>
  `Two modules in this Halero build both use the id "${id}". Module ids ` +
  "must be unique; remove or rebuild one of them.";

const duplicateKindMessage = (
  kind: string,
  owner: string,
  claimant: string,
): string =>
  `The "${claimant}" module registers the entity kind "${kind}", but the ` +
  `"${owner}" module already owns it. Each entity kind can belong to ` +
  "exactly one module.";

const unregisteredKindMessage = (connectorId: string, kind: string): string =>
  `The "${connectorId}" connector produces "${kind}" items, but no module ` +
  "in this Halero build stores that kind. Update Halero or remove the " +
  "connector.";

const kindTooNewMessage = (
  connectorId: string,
  registered: RegisteredEntityKind,
  producedVersion: number,
): string =>
  `The "${connectorId}" connector produces "${registered.kind}" items at ` +
  `schema version ${producedVersion}, but the "${registered.moduleId}" ` +
  `module in this Halero build only understands versions up to ` +
  `${registered.schemaVersion}. Update Halero.`;

const missingUpcastMessage = (
  registered: RegisteredEntityKind,
  fromVersion: number,
): string =>
  `The "${registered.moduleId}" module cannot upgrade "${registered.kind}" ` +
  `data from schema version ${fromVersion} to ${fromVersion + 1}: no ` +
  "upcast is registered for that step. Update or rebuild the module " +
  "package.";

/**
 * Builds the kind index the host resolves satellite writers and upcasts
 * through. Fails loudly at boot on a malformed manifest, a duplicate
 * module id, or two modules claiming the same kind.
 */
export const buildKindRegistry = (
  modules: readonly ServerModule[],
): KindRegistry => {
  const registry = new Map<string, RegisteredEntityKind>();
  const moduleIds = new Set<string>();
  for (const module of modules) {
    if (!serverModuleManifestSchema.safeParse(module).success) {
      throw new Error(MALFORMED_MODULE_MESSAGE);
    }
    if (moduleIds.has(module.id)) {
      throw new Error(duplicateModuleMessage(module.id));
    }
    moduleIds.add(module.id);
    for (const contribution of module.entityKinds ?? []) {
      const owner = registry.get(contribution.kind);
      if (owner !== undefined) {
        throw new Error(
          duplicateKindMessage(contribution.kind, owner.moduleId, module.id),
        );
      }
      registry.set(contribution.kind, {
        ...contribution,
        moduleId: module.id,
      });
    }
  }
  return new ValidatedKindRegistry(registry);
};

export interface ProducedKindRef {
  readonly kind: string;
  readonly schemaVersion: number;
}

/**
 * The v0.1 version-window rule for connector-produced kinds: the kind
 * must be registered, the produced version must not exceed the
 * registered one, and a lower version needs an upcast for every step up
 * to the registered version. Exact matches need no upcasts.
 */
export const assertProducedKindSupported = (
  registry: KindRegistry,
  connectorId: string,
  produced: ProducedKindRef,
): void => {
  const registered = registry.get(produced.kind);
  if (registered === undefined) {
    throw new Error(unregisteredKindMessage(connectorId, produced.kind));
  }
  if (produced.schemaVersion > registered.schemaVersion) {
    throw new Error(
      kindTooNewMessage(connectorId, registered, produced.schemaVersion),
    );
  }
  for (let step = produced.schemaVersion; step < registered.schemaVersion; ) {
    if (typeof registered.upcasts?.[step] !== "function") {
      throw new Error(missingUpcastMessage(registered, step));
    }
    step += 1;
  }
};

/**
 * Runs the upcast chain from fromVersion up to the registered version and
 * returns the payload at the registered version. Fails readably when a
 * step is missing; a payload already at the registered version passes
 * through untouched.
 */
export const applyUpcasts = (
  registered: RegisteredEntityKind,
  fromVersion: number,
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  let current = payload;
  for (let step = fromVersion; step < registered.schemaVersion; ) {
    const upcast = registered.upcasts?.[step];
    if (upcast === undefined) {
      throw new Error(missingUpcastMessage(registered, step));
    }
    current = upcast(current);
    step += 1;
  }
  return current;
};

/**
 * Validated link-kind lookup. Private field makes the type nominal, so a
 * hand-built map cannot pass as one: every registry the host hands the
 * links router went through buildLinkKindRegistry's validation.
 */
class ValidatedLinkKindRegistry {
  readonly #byKind: ReadonlyMap<string, LinkKindContribution>;

  constructor(byKind: ReadonlyMap<string, LinkKindContribution>) {
    this.#byKind = byKind;
  }

  get(kind: string): LinkKindContribution | undefined {
    return this.#byKind.get(kind);
  }

  /** Every registered kind, e.g. for a "relate to" picker's options. */
  all(): readonly LinkKindContribution[] {
    return [...this.#byKind.values()];
  }
}

export type LinkKindRegistry = ValidatedLinkKindRegistry;

const MALFORMED_LINK_KIND_MESSAGE =
  "A link kind is malformed: kind, label, from, and to must all be " +
  "non-empty. Update or rebuild the module package.";

const duplicateLinkKindMessage = (kind: string): string =>
  `Two link kinds in this Halero build both use the id "${kind}". Link ` +
  "kind ids must be unique; remove or rebuild one of them.";

const isMalformedLinkKind = (contribution: LinkKindContribution): boolean =>
  contribution.kind.length === 0 ||
  contribution.label.length === 0 ||
  contribution.from.length === 0 ||
  contribution.to.length === 0;

/**
 * Builds the link-kind index the host's links router validates edges
 * through. Takes a flat list rather than modules because link kinds have
 * a host-owned tier (the built-in "relates_to") that no module owns.
 * Fails loudly at boot on a malformed contribution or a duplicate id.
 */
export const buildLinkKindRegistry = (
  contributions: readonly LinkKindContribution[],
): LinkKindRegistry => {
  const registry = new Map<string, LinkKindContribution>();
  for (const contribution of contributions) {
    if (isMalformedLinkKind(contribution)) {
      throw new Error(MALFORMED_LINK_KIND_MESSAGE);
    }
    if (registry.has(contribution.kind)) {
      throw new Error(duplicateLinkKindMessage(contribution.kind));
    }
    registry.set(contribution.kind, contribution);
  }
  return new ValidatedLinkKindRegistry(registry);
};
