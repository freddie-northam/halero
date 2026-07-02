import type { ComponentType } from "react";

/**
 * One block on the Today page, mirroring PageContribution's conventions.
 * v0.1 deliberately ships no generic contribution-point framework: the
 * host wires a hardcoded array of these (see the web app's registry), so
 * the eventual contribution mechanism can replace that wiring without
 * touching this contract or any module.
 */
export interface TodaySection {
  readonly id: string;
  /** Sections render sorted ascending, like nav contributions. */
  readonly order: number;
  readonly component: ComponentType;
}
