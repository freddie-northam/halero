// AppRouter is imported as a type only. Together with verbatimModuleSyntax
// this guarantees the whole import statement is erased at compile time, so
// no server runtime code can ever reach the extension bundle.
import type { AppRouter } from "@halero/server/trpc";
import { getPreferenceValues } from "@raycast/api";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

// A type alias (not an interface) so it satisfies Raycast's PreferenceValues
// constraint via the implicit index signature.
export type HaleroPrefs = {
  baseUrl: string;
  apiToken?: string;
};

export const getPrefs = (): HaleroPrefs => getPreferenceValues<HaleroPrefs>();

export const authHeaders = (apiToken?: string): Record<string, string> =>
  apiToken ? { Authorization: `Bearer ${apiToken}` } : {};

export const createHaleroClient = (prefs: HaleroPrefs) =>
  createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${prefs.baseUrl.replace(/\/+$/, "")}/api/trpc`,
        headers: () => authHeaders(prefs.apiToken),
      }),
    ],
  });

export type HaleroClient = ReturnType<typeof createHaleroClient>;
