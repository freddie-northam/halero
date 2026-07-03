// The web side of the module contract: what a module contributes to the
// Halero web app (navigation entries and routed pages). Pure types plus
// an identity helper; the app's compile-time registry consumes them.

import type { ComponentType } from "react";

export interface NavContribution {
  readonly label: string;
  readonly icon?: string;
  readonly path: string;
  /** Nav renders sorted ascending; Today ships at 10, core Settings at 100. */
  readonly order: number;
}

/**
 * Normalizes a page's URL search params into renderable state. Plain
 * function type on purpose: it is structurally compatible with TanStack
 * Router's validateSearch without the SDK depending on the router.
 */
export type SearchValidator = (
  search: Record<string, unknown>,
) => Record<string, unknown>;

/**
 * A routed page. Divergence from the original contract sketch: the
 * component is a plain React component rather than a TanStack
 * LazyRouteComponent, because the app's routes are code-based and eager
 * today and this keeps TanStack Router out of the SDK entirely.
 */
export interface PageContribution {
  readonly path: string;
  readonly component: ComponentType;
  /** Wired into the host route so bad URLs normalize instead of erroring. */
  readonly validateSearch?: SearchValidator;
}

/**
 * The slice of a search hit a module needs to build a link: the entity's
 * identity plus the home-timezone date the server already derived. The
 * web app never does timezone math to route a hit.
 */
export interface EntityLinkHit {
  readonly entityId: string;
  readonly occurredDate: string | null;
}

/** An in-app destination: a route path plus optional search params. */
export interface EntityLink {
  readonly path: string;
  readonly search?: Readonly<Record<string, string>>;
}

/**
 * Declares where entities of one kind live in the web app, so core
 * surfaces like the search palette can navigate to a hit without core
 * ever hardcoding module kinds.
 */
export interface EntityLinkContribution {
  readonly kind: string;
  /** Group heading for hits of this kind, e.g. "Event". */
  readonly label: string;
  readonly buildLink: (hit: EntityLinkHit) => EntityLink;
}

/**
 * What a palette command reports after running: a confirmation message
 * plus an optional in-app destination. The destination reuses the
 * EntityLink shape so the host navigates command results and search
 * hits through the same mechanism; everything stays JSON-serializable.
 */
export interface CommandRunResult {
  readonly message: string;
  readonly navigateTo?: EntityLink;
}

/**
 * An action a module offers the command palette. `describe` labels the
 * row for the palette's current input (null hides the row for that
 * input); `run` receives the raw input untrimmed, because trimming and
 * validation belong to the contribution, not the palette.
 */
export interface CommandContribution {
  /** Module-scoped and globally unique, e.g. "tasks.new". */
  readonly id: string;
  readonly describe: (input: string) => string | null;
  readonly run: (input: string) => Promise<CommandRunResult>;
}

export interface WebModule {
  /** Must match the server module id, e.g. "calendar". */
  readonly id: string;
  readonly nav?: readonly NavContribution[];
  readonly pages?: readonly PageContribution[];
  readonly entityLinks?: readonly EntityLinkContribution[];
  readonly commands?: readonly CommandContribution[];
}

/**
 * Identity helper that pins a module to the SDK's contract while
 * preserving the concrete type.
 */
export const defineWebModule = <M extends WebModule>(module: M): M => module;
