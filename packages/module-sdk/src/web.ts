// The web side of the module contract: what a module contributes to the
// Halero web app (navigation entries and routed pages). Pure types plus
// an identity helper; the app's compile-time registry consumes them.

import type { ComponentType } from "react";

export interface NavContribution {
  readonly label: string;
  readonly icon?: string;
  readonly path: string;
  /** Nav renders sorted ascending; core reserves 10 (Today) and 100 (Settings). */
  readonly order: number;
}

/**
 * A routed page. Divergence from the original contract sketch: the
 * component is a plain React component rather than a TanStack
 * LazyRouteComponent, because the app's routes are code-based and eager
 * today and this keeps TanStack Router out of the SDK entirely.
 */
export interface PageContribution {
  readonly path: string;
  readonly component: ComponentType;
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
