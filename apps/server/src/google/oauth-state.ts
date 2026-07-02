import { randomBytes } from "node:crypto";
import type { HaleroDatabase } from "@halero/db";
import { deleteSetting, getSetting, setSetting } from "../settings";
import { asRecord } from "./common";

type Db = HaleroDatabase["db"];

const STATE_KEY = "oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;

export const createOauthState = (db: Db, now: number): string => {
  const state = randomBytes(32).toString("hex");
  setSetting(
    db,
    STATE_KEY,
    JSON.stringify({ state, expiresAt: now + STATE_TTL_MS }),
  );
  return state;
};

const parseStoredState = (
  raw: string,
): { state: string; expiresAt: number } | null => {
  try {
    const record = asRecord(JSON.parse(raw));
    if (record === null) {
      return null;
    }
    const { state, expiresAt } = record;
    if (typeof state !== "string" || typeof expiresAt !== "number") {
      return null;
    }
    return { state, expiresAt };
  } catch {
    return null;
  }
};

/**
 * Single-use by construction: the stored state is deleted on the first
 * callback that tries to consume it, whatever the outcome.
 */
export const consumeOauthState = (
  db: Db,
  now: number,
  candidate: string,
): boolean => {
  const raw = getSetting(db, STATE_KEY);
  if (raw === null) {
    return false;
  }
  deleteSetting(db, STATE_KEY);
  const stored = parseStoredState(raw);
  if (stored === null) {
    return false;
  }
  return stored.state === candidate && stored.expiresAt > now;
};
