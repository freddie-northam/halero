// Failure notifications: one optional webhook URL (notify_url setting),
// one JSON POST per event. Off by default; delivery is best-effort and
// must never affect the sync path, so send() logs failures and resolves
// false instead of throwing.

import type { FetchLike } from "@halero/connector-sdk";
import type { HaleroDatabase } from "@halero/db";
import { getSetting } from "./settings";

type Db = HaleroDatabase["db"];

export const NOTIFY_URL_SETTING = "notify_url";

/** A slow target must not hold notification sends open indefinitely. */
const NOTIFY_TIMEOUT_MS = 5_000;

export interface NotificationPayload {
  readonly title: string;
  readonly message: string;
  readonly connectorId: string;
  readonly status: string;
}

export interface NotifierContext {
  readonly db: Db;
  /** Outbound HTTP for notification posts; tests inject a fake. */
  readonly notifyFetch: FetchLike;
  /** Sink for delivery failures; defaults to console.error. */
  readonly log?: (message: string) => void;
}

export interface Notifier {
  /**
   * Delivers one notification to the configured notify_url. Resolves
   * false and NEVER throws when no URL is set or delivery fails, so
   * callers can fire and forget.
   */
  readonly send: (payload: NotificationPayload) => Promise<boolean>;
}

export const createNotifier = (ctx: NotifierContext): Notifier => {
  const log = ctx.log ?? ((message: string) => console.error(message));
  const send = async (payload: NotificationPayload): Promise<boolean> => {
    const url = getSetting(ctx.db, NOTIFY_URL_SETTING);
    if (url === null) {
      return false;
    }
    try {
      const res = await ctx.notifyFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
      });
      if (!res.ok) {
        log(
          "The notification could not be delivered: the notification URL " +
            `answered with status ${res.status}.`,
        );
        return false;
      }
      return true;
    } catch {
      log(
        "The notification could not be delivered: the notification URL did " +
          "not respond within 5 seconds or the request failed.",
      );
      return false;
    }
  };
  return { send };
};
