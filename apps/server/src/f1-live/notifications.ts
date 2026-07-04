// F1 notifications: a periodic job that fires the optional notify_url
// webhook for two things the user asked to follow, deduped through the
// settings table so a restart or an extra tick never double-sends.
//
//   1. Session-start reminders (free): a heads-up shortly before any
//      session in the synced schedule begins.
//   2. Live race events (paid live tier): the big race-control moments
//      (red flag, safety car, chequered flag) while a session is live and
//      the user's OpenF1 credential is stored.
//
// Delivery is best-effort: the notifier never throws and no-ops when no
// notify_url is set, so a missing or slow webhook never affects anything.

import type { FetchLike } from "@halero/connector-sdk";
import { f1Sessions, type HaleroDatabase } from "@halero/db";
import { Cron } from "croner";
import { eq } from "drizzle-orm";
import type { Notifier } from "../notifier";
import { getSetting, setSetting } from "../settings";
import { readLiveCredential } from "./credential";
import { buildLiveSession, fetchLiveRows } from "./live-data";
import { getLiveToken } from "./token";

type Db = HaleroDatabase["db"];

const REMINDED_SESSIONS_SETTING = "f1_reminded_sessions";
const RACE_CONTROL_SEEN_SETTING = "f1_race_control_seen_at";

/** How far ahead of a session start to send the reminder. */
export const REMINDER_LEAD_MS = 15 * 60 * 1000;

/** How often the job runs. */
const F1_NOTIFY_CRON = "0 * * * * *";

const OPENF1_FREE_BASE = "https://api.openf1.org/v1";

// --- pure selection logic (unit-tested) ----------------------------------

export interface ReminderCandidate {
  readonly sessionKey: number;
  readonly dateStart: string | null;
  readonly label: string;
}

export interface ReminderSelection {
  readonly due: readonly ReminderCandidate[];
  readonly reminded: readonly number[];
}

/**
 * Picks the sessions whose start falls inside the lead window and that have
 * not been reminded yet, and returns the updated reminded set. The set is
 * pruned to sessions still in the future so it cannot grow without bound.
 */
export const selectDueReminders = (
  sessions: readonly ReminderCandidate[],
  now: number,
  remindedKeys: readonly number[],
  leadMs: number,
): ReminderSelection => {
  const reminded = new Set(remindedKeys);
  const due: ReminderCandidate[] = [];
  const stillFuture = new Set<number>();
  for (const session of sessions) {
    if (session.dateStart === null) {
      continue;
    }
    const startMs = Date.parse(session.dateStart);
    if (Number.isNaN(startMs) || startMs < now) {
      continue;
    }
    stillFuture.add(session.sessionKey);
    if (startMs <= now + leadMs && !reminded.has(session.sessionKey)) {
      due.push(session);
    }
  }
  // Keep only future sessions plus the ones just reminded, so past keys age
  // out but a session reminded this tick is not reminded again next tick.
  const nextReminded = new Set<number>();
  for (const key of reminded) {
    if (stillFuture.has(key)) {
      nextReminded.add(key);
    }
  }
  for (const session of due) {
    nextReminded.add(session.sessionKey);
  }
  return { due, reminded: [...nextReminded] };
};

export interface RaceControlMsg {
  readonly date: string | null;
  readonly flag: string | null;
  readonly category: string | null;
  readonly message: string | null;
}

/** The few race-control moments worth interrupting someone for. */
export const isImportantRaceControl = (msg: RaceControlMsg): boolean => {
  if (msg.flag !== null && msg.flag.toUpperCase() === "RED") {
    return true;
  }
  if (msg.category !== null && msg.category.toUpperCase() === "SAFETYCAR") {
    return true;
  }
  const text = (msg.message ?? "").toUpperCase();
  return (
    text.includes("SAFETY CAR") ||
    text.includes("CHEQUERED FLAG") ||
    text.includes("RED FLAG")
  );
};

export interface RaceControlSelection {
  readonly important: readonly RaceControlMsg[];
  readonly seenAt: string | null;
}

/**
 * Filters to the important messages newer than the last one seen, and
 * advances the watermark to the newest message of any kind so nothing is
 * re-scanned next tick.
 */
export const selectNewRaceControl = (
  messages: readonly RaceControlMsg[],
  seenAt: string | null,
): RaceControlSelection => {
  let newest = seenAt;
  const important: RaceControlMsg[] = [];
  for (const msg of messages) {
    if (msg.date === null) {
      continue;
    }
    if (seenAt === null || msg.date > seenAt) {
      if (isImportantRaceControl(msg)) {
        important.push(msg);
      }
    }
    if (newest === null || msg.date > newest) {
      newest = msg.date;
    }
  }
  return { important, seenAt: newest };
};

// --- the job -------------------------------------------------------------

export interface F1NotificationContext {
  readonly db: Db;
  readonly key: Uint8Array;
  readonly now: () => number;
  readonly outboundFetch: FetchLike;
  readonly notifier: Notifier;
  readonly log?: (message: string) => void;
}

const readNumberSet = (db: Db, settingKey: string): number[] => {
  const raw = getSetting(db, settingKey);
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is number => typeof v === "number")
      : [];
  } catch {
    return [];
  }
};

const currentSeasonReminderCandidates = (
  db: Db,
  now: number,
): ReminderCandidate[] => {
  const year = new Date(now).getUTCFullYear();
  return db
    .select()
    .from(f1Sessions)
    .where(eq(f1Sessions.year, year))
    .all()
    .map((row) => ({
      sessionKey: row.sessionKey,
      dateStart: row.dateStart,
      label: `${row.meetingName ?? row.countryName ?? "F1"} ${row.sessionName}`,
    }));
};

const sendSessionReminders = async (
  ctx: F1NotificationContext,
): Promise<void> => {
  const now = ctx.now();
  const candidates = currentSeasonReminderCandidates(ctx.db, now);
  const remindedKeys = readNumberSet(ctx.db, REMINDED_SESSIONS_SETTING);
  const { due, reminded } = selectDueReminders(
    candidates,
    now,
    remindedKeys,
    REMINDER_LEAD_MS,
  );
  if (due.length === 0) {
    // Still persist the pruned set so old keys age out over time.
    setSetting(ctx.db, REMINDED_SESSIONS_SETTING, JSON.stringify(reminded));
    return;
  }
  for (const session of due) {
    await ctx.notifier.send({
      title: "F1 session starting soon",
      message: `${session.label} starts within 15 minutes.`,
      connectorId: "f1",
      status: "reminder",
    });
  }
  setSetting(ctx.db, REMINDED_SESSIONS_SETTING, JSON.stringify(reminded));
};

const fetchLatestSessionRow = async (
  fetchImpl: FetchLike,
): Promise<Record<string, unknown> | undefined> => {
  const response = await fetchImpl(
    `${OPENF1_FREE_BASE}/sessions?session_key=latest`,
  ).catch(() => null);
  if (response === null || !response.ok) {
    return undefined;
  }
  const body: unknown = await response.json().catch(() => null);
  return Array.isArray(body) && typeof body[0] === "object" && body[0] !== null
    ? (body[0] as Record<string, unknown>)
    : undefined;
};

const sendLiveEvents = async (ctx: F1NotificationContext): Promise<void> => {
  const credential = readLiveCredential(ctx.db, ctx.key);
  if (credential === null) {
    return;
  }
  const sessionRow = await fetchLatestSessionRow(ctx.outboundFetch);
  const session = buildLiveSession(sessionRow, ctx.now());
  if (session === null || !session.isLive) {
    return;
  }
  const token = await getLiveToken(ctx.outboundFetch, credential, ctx.now);
  const rows = await fetchLiveRows(
    ctx.outboundFetch,
    token,
    "race_control?session_key=latest",
  );
  const messages: RaceControlMsg[] = rows.map((row) => ({
    date: typeof row.date === "string" ? row.date : null,
    flag: typeof row.flag === "string" ? row.flag : null,
    category: typeof row.category === "string" ? row.category : null,
    message: typeof row.message === "string" ? row.message : null,
  }));
  const seenAt = getSetting(ctx.db, RACE_CONTROL_SEEN_SETTING);
  const selection = selectNewRaceControl(messages, seenAt);
  for (const msg of selection.important) {
    await ctx.notifier.send({
      title: `F1 live: ${session.meetingName ?? "race"}`,
      message: msg.message ?? "Race control update.",
      connectorId: "f1",
      status: "live",
    });
  }
  if (selection.seenAt !== null) {
    setSetting(ctx.db, RACE_CONTROL_SEEN_SETTING, selection.seenAt);
  }
};

const readableError = (error: unknown): string =>
  error instanceof Error && error.message.trim() !== ""
    ? error.message
    : "unknown error";

/** One notification pass, with every failure contained. */
export const runF1Notifications = async (
  ctx: F1NotificationContext,
): Promise<void> => {
  const log = ctx.log ?? ((message: string) => console.error(message));
  try {
    await sendSessionReminders(ctx);
  } catch (error) {
    log(`F1 session reminders failed: ${readableError(error)}`);
  }
  try {
    await sendLiveEvents(ctx);
  } catch (error) {
    log(`F1 live notifications failed: ${readableError(error)}`);
  }
};

export interface BackgroundJob {
  readonly start: () => void;
  readonly stop: () => void;
  readonly isRunning: () => boolean;
}

/**
 * The F1 notification cron, started and stopped by the sync scheduler's
 * lifecycle so one switch controls all background work.
 */
export const createF1NotificationJob = (
  ctx: F1NotificationContext,
): BackgroundJob => {
  let job: Cron | null = null;
  return {
    start: () => {
      if (job !== null && !job.isStopped()) {
        return;
      }
      job = new Cron(F1_NOTIFY_CRON, { protect: true }, () => {
        runF1Notifications(ctx).catch((error: unknown) => {
          console.error(
            `F1 notifications tick failed: ${readableError(error)}`,
          );
        });
      });
    },
    stop: () => {
      job?.stop();
      job = null;
    },
    isRunning: () => job !== null && !job.isStopped(),
  };
};
