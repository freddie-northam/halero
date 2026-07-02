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
