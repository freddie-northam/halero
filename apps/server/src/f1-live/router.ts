// The F1 live-timing host router. Unlike the F1 module's own procedures
// (which run in the module context and touch only free data), live timing
// needs the encryption key to read the user's stored OpenF1 credential and
// the token-exchange helper, both host concerns, so it lives here and is
// mounted at f1Live.* alongside the other host routers.

import type { FetchLike } from "@halero/connector-sdk";
import type {
  LiveSession,
  LiveTiming,
  LiveWeather,
} from "@halero/module-f1/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./../trpc/init";
import {
  clearLiveCredential,
  hasLiveCredential,
  readLiveCredential,
  storeLiveCredential,
} from "./credential";
import { buildLiveSession, buildTimingRows, fetchLiveRows } from "./live-data";
import { exchangeToken, getLiveToken } from "./token";

const OPENF1_FREE_BASE = "https://api.openf1.org/v1";

const badRequest = (message: string, cause?: unknown): TRPCError =>
  new TRPCError({ code: "BAD_REQUEST", message, cause });

/** Fetches the current session header from the free sessions endpoint. */
const fetchLatestSession = async (
  fetchImpl: FetchLike,
  now: number,
): Promise<LiveSession | null> => {
  const response = await fetchImpl(
    `${OPENF1_FREE_BASE}/sessions?session_key=latest`,
  ).catch(() => null);
  if (response === null || !response.ok) {
    return null;
  }
  const body: unknown = await response.json().catch(() => null);
  const row =
    Array.isArray(body) && typeof body[0] === "object" && body[0] !== null
      ? (body[0] as Record<string, unknown>)
      : undefined;
  return buildLiveSession(row, now);
};

export const f1LiveRouter = router({
  status: protectedProcedure.query(({ ctx }) => ({
    connected: hasLiveCredential(ctx.db, ctx.key),
  })),

  /** Validates the credential by exchanging it, then stores it. */
  connect: protectedProcedure
    .input(
      z.object({
        username: z.string().trim().min(1, "Enter your OpenF1 username."),
        password: z.string().min(1, "Enter your OpenF1 password."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await exchangeToken(ctx.outboundFetch, input, ctx.now());
      } catch (error) {
        throw badRequest(
          error instanceof Error && error.message.trim() !== ""
            ? error.message
            : "Those credentials could not be verified.",
          error,
        );
      }
      storeLiveCredential(ctx.db, ctx.key, ctx.now(), input);
      return { connected: true as const };
    }),

  disconnect: protectedProcedure.mutation(({ ctx }) => {
    clearLiveCredential(ctx.db);
    return { connected: false as const };
  }),

  /** The current session header (free, no credential needed). */
  session: protectedProcedure.query(
    ({ ctx }): Promise<LiveSession | null> =>
      fetchLatestSession(ctx.outboundFetch, ctx.now()),
  ),

  /** The live timing tower. Empty rows + requiresCredential when unconnected. */
  timing: protectedProcedure.query(async ({ ctx }): Promise<LiveTiming> => {
    const session = await fetchLatestSession(ctx.outboundFetch, ctx.now());
    const credential = readLiveCredential(ctx.db, ctx.key);
    if (credential === null) {
      return { session, rows: [], requiresCredential: true };
    }
    const token = await getLiveToken(ctx.outboundFetch, credential, ctx.now);
    const [drivers, positions, intervals, stints] = await Promise.all([
      fetchLiveRows(ctx.outboundFetch, token, "drivers?session_key=latest"),
      fetchLiveRows(ctx.outboundFetch, token, "position?session_key=latest"),
      fetchLiveRows(ctx.outboundFetch, token, "intervals?session_key=latest"),
      fetchLiveRows(ctx.outboundFetch, token, "stints?session_key=latest"),
    ]);
    return {
      session,
      rows: buildTimingRows(drivers, positions, intervals, stints),
      requiresCredential: false,
    };
  }),

  /**
   * Current track/air conditions during a live session. Returns null (not
   * an error) when no credential is stored, so the widget shows a calm
   * empty/connect state instead of a failure.
   */
  weather: protectedProcedure.query(
    async ({ ctx }): Promise<LiveWeather | null> => {
      const credential = readLiveCredential(ctx.db, ctx.key);
      if (credential === null) {
        return null;
      }
      const token = await getLiveToken(ctx.outboundFetch, credential, ctx.now);
      const rows = await fetchLiveRows(
        ctx.outboundFetch,
        token,
        "weather?session_key=latest",
      );
      const row = rows[rows.length - 1];
      if (row === undefined) {
        return null;
      }
      const numOrNull = (value: unknown): number | null =>
        typeof value === "number" && Number.isFinite(value) ? value : null;
      return {
        date: typeof row.date === "string" ? row.date : null,
        airTemperature: numOrNull(row.air_temperature),
        trackTemperature: numOrNull(row.track_temperature),
        humidity: numOrNull(row.humidity),
        rainfall: numOrNull(row.rainfall),
        windSpeed: numOrNull(row.wind_speed),
        windDirection: numOrNull(row.wind_direction),
      };
    },
  ),
});

export type F1LiveRouter = typeof f1LiveRouter;
