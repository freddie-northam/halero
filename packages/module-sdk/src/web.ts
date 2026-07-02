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

export interface WebModule {
  /** Must match the server module id, e.g. "calendar". */
  readonly id: string;
  readonly nav?: readonly NavContribution[];
  readonly pages?: readonly PageContribution[];
}

/**
 * Identity helper that pins a module to the SDK's contract while
 * preserving the concrete type.
 */
export const defineWebModule = <M extends WebModule>(module: M): M => module;
