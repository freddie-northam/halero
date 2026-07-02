import { redirect } from "@tanstack/react-router";
import type { HaleroApi } from "./api";
import { type EntryRoute, resolveEntryRoute } from "./resolve-entry-route";

/**
 * Route guard shared by all three entry routes: asks the server where the
 * visitor belongs and redirects unless they are already there.
 */
export const guardEntry = async (
  api: HaleroApi,
  current: EntryRoute,
): Promise<void> => {
  const status = await api.systemStatus();
  const entry = resolveEntryRoute(status);
  if (entry !== current) {
    throw redirect({ to: entry });
  }
};

/**
 * Guard for pages inside the signed-in shell (like /settings): anyone who
 * does not belong at "/" gets sent to where they do belong.
 */
export const guardAuthenticated = async (api: HaleroApi): Promise<void> => {
  const status = await api.systemStatus();
  const entry = resolveEntryRoute(status);
  if (entry !== "/") {
    throw redirect({ to: entry });
  }
};
