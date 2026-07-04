// The module's react-query keys and the invalidation wrapper the host
// registry applies to its F1Api. The keys never leave this module: the
// host holds the QueryClient and calls the wrapper, so core code never
// learns (or hardcodes) module cache shapes. Mirrors withTasksInvalidation.

import type { QueryClient } from "@tanstack/react-query";
import type { F1Api } from "./api";

const f1RootKey = ["f1"] as const;

export const f1ScheduleKey = [...f1RootKey, "schedule"] as const;

export const f1NextUpKey = [...f1RootKey, "nextUp"] as const;

export const f1BoardsKey = [...f1RootKey, "boards"] as const;

export const f1ResultKey = (sessionKey: number) =>
  [...f1RootKey, "result", sessionKey] as const;

/** The latest-result widget's key: a distinct leaf from a keyed session. */
export const f1LatestResultKey = [...f1RootKey, "result", "latest"] as const;

/** kind is "driver" or "constructor"; sessionKey null means season-latest. */
export const f1StandingsKey = (
  kind: "driver" | "constructor",
  sessionKey: number | null,
) => [...f1RootKey, "standings", kind, sessionKey] as const;

/** The race-explorer session list feeding every widget's session picker. */
export const f1RaceSessionsKey = [...f1RootKey, "raceSessions"] as const;

/** A phase-2 detail query's key: one leaf per widget name and session. */
export const f1DetailKey = (name: string, sessionKey: number | null) =>
  [...f1RootKey, name, sessionKey] as const;

/**
 * Wraps an F1Api so every successful board mutation invalidates the
 * board list and resolves only after active queries refetched. Reads and
 * the reference data queries pass through untouched: only the boards
 * change from the client, so only ["f1","boards"] needs invalidating.
 */
export const withF1Invalidation = (
  api: F1Api,
  queryClient: QueryClient,
): F1Api => {
  const invalidateBoards = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: f1BoardsKey });
  };
  return {
    schedule: api.schedule,
    nextUp: api.nextUp,
    sessionResult: api.sessionResult,
    latestResult: api.latestResult,
    driverStandings: api.driverStandings,
    constructorStandings: api.constructorStandings,
    // Phase-2 race detail is read-only; it passes straight through.
    raceSessions: api.raceSessions,
    laps: api.laps,
    stints: api.stints,
    pits: api.pits,
    positions: api.positions,
    raceControl: api.raceControl,
    teamRadio: api.teamRadio,
    overtakes: api.overtakes,
    weather: api.weather,
    startingGrid: api.startingGrid,
    boards: {
      list: api.boards.list,
      create: async (input) => {
        const board = await api.boards.create(input);
        await invalidateBoards();
        return board;
      },
      rename: async (input) => {
        const result = await api.boards.rename(input);
        await invalidateBoards();
        return result;
      },
      remove: async (input) => {
        const result = await api.boards.remove(input);
        await invalidateBoards();
        return result;
      },
      saveLayout: async (input) => {
        const result = await api.boards.saveLayout(input);
        await invalidateBoards();
        return result;
      },
    },
  };
};
