// The palette command for jumping to the F1 board: type "race" (or "f1",
// or "grand prix") and the command reports the next session before
// landing on the board. The host hands it the registry-wired F1Api, so
// this file never touches query keys or the transport.

import type { CommandContribution } from "@halero/module-sdk/web";
import type { F1Api } from "./api";

/** Matches the words that should surface this command in the palette. */
const F1_QUERY = /f1|race|grand prix/i;

export const createNextRaceCommand = (api: F1Api): CommandContribution => ({
  id: "f1.next",
  describe: (input) => (F1_QUERY.test(input) ? "F1: next race" : null),
  run: async () => {
    const next = await api.nextUp();
    const weekendName =
      next.weekend?.meetingName ?? next.weekend?.countryName ?? null;
    const sessionName = next.session?.sessionName ?? null;
    const message =
      weekendName === null
        ? "No upcoming race on the calendar."
        : sessionName === null
          ? `Next up: ${weekendName}.`
          : `Next up: ${sessionName} at ${weekendName}.`;
    return { message, navigateTo: { path: "/f1" } };
  },
});
