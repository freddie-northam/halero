// What the F1 web surfaces need from the host: the module's own tRPC
// procedures, wired up by the app registry against client.modules.f1.*.
// Pure interface, no tRPC import: the host owns the transport and hands
// this seam (already wrapped with cache invalidation) to the module.

import type {
  Board,
  DriverStanding,
  NextUp,
  SeasonSchedule,
  SessionResult,
  TeamStanding,
  WidgetInstance,
} from "../contract";

/** The schedule the server returns, carrying the home timezone it derived. */
export type F1Schedule = SeasonSchedule & { readonly homeTimezone: string };

/** Optional session anchor: standings default to the season-latest when omitted. */
export interface StandingsQuery {
  readonly sessionKey?: number;
}

/** The board mutations, grouped the way the server router nests them. */
export interface F1BoardsApi {
  readonly list: () => Promise<Board[]>;
  readonly create: (input: { readonly name: string }) => Promise<Board>;
  readonly rename: (input: {
    readonly id: string;
    readonly name: string;
  }) => Promise<{ readonly ok: true }>;
  readonly remove: (input: {
    readonly id: string;
  }) => Promise<{ readonly ok: true }>;
  readonly saveLayout: (input: {
    readonly id: string;
    readonly layout: readonly WidgetInstance[];
  }) => Promise<{ readonly ok: true }>;
}

export interface F1Api {
  readonly schedule: () => Promise<F1Schedule>;
  readonly nextUp: () => Promise<NextUp>;
  readonly sessionResult: (input: {
    readonly sessionKey: number;
  }) => Promise<SessionResult>;
  readonly latestResult: () => Promise<SessionResult | null>;
  readonly driverStandings: (
    input?: StandingsQuery,
  ) => Promise<DriverStanding[]>;
  readonly constructorStandings: (
    input?: StandingsQuery,
  ) => Promise<TeamStanding[]>;
  readonly boards: F1BoardsApi;
}
