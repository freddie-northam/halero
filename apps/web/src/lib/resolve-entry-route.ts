export interface EntryStatus {
  readonly needsSetup: boolean;
  readonly authenticated: boolean;
  /** The owner's name, present only once authenticated; for the header avatar. */
  readonly displayName?: string | null;
}

export type EntryRoute = "/setup" | "/login" | "/";

/**
 * Decides where a visitor lands based on the instance status reported by
 * `system.status`. Setup always wins: an instance without a password must be
 * claimed before anything else is reachable.
 */
export const resolveEntryRoute = (status: EntryStatus): EntryRoute => {
  if (status.needsSetup) {
    return "/setup";
  }
  if (!status.authenticated) {
    return "/login";
  }
  return "/";
};
