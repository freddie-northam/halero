import type { HaleroDatabase } from "@halero/db";
import { type HaleroConfig, isParseableUrl } from "./config";
import { getSetting } from "./settings";

type Db = HaleroDatabase["db"];

/**
 * The single base-URL authority: the base_url stored during setup wins over
 * the environment-derived config default. Resolved at request time so every
 * consumer (CSRF allowed origin, session cookie Secure flag, OAuth redirect
 * URI and HTTPS gate, status query) agrees on one value and none of them
 * can silently drift apart. loadConfig stays pure; only this helper reads
 * the settings table.
 */
export const resolveBaseUrl = (db: Db, config: HaleroConfig): URL => {
  const stored = getSetting(db, "base_url");
  if (stored !== null && isParseableUrl(stored)) {
    return new URL(stored);
  }
  return config.baseUrl;
};
