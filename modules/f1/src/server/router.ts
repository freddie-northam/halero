// The F1 module's tRPC router. Three concerns:
//
//   * schedule/calendar/nextUp read the connector-synced f1_sessions
//     (already on the spine) and shape them into weekends.
//   * sessionResult/standings/drivers are fetch-on-view: pulled from OpenF1
//     on first request, cached in the f1_* tables (immutable once a session
//     ends), and read back from there afterwards.
//   * boards persist the user's customizable widget dashboards.

import {
  f1Boards,
  f1Drivers,
  f1SessionResults,
  f1Sessions,
  f1StandingsDrivers,
  f1StandingsTeams,
  settings,
} from "@halero/db";
import type { ModuleDb } from "@halero/module-sdk/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type {
  Board,
  DriverStanding,
  NextUp,
  ResultRow,
  SeasonSchedule,
  SessionLite,
  SessionResult,
  SessionState,
  TeamStanding,
  Weekend,
  WidgetInstance,
} from "../contract";
import {
  asBool,
  asGap,
  asNumber,
  asString,
  type FetchLike,
  fetchRows,
} from "./openf1-client";
import { moduleRouter, protectedProcedure } from "./trpc";

/** The f1.session satellite schema version this build stores. */
export const F1_SESSION_SCHEMA_VERSION = 1;

const SESSION_FALLBACK_MS = 2 * 60 * 60 * 1000;

const readHomeTimezone = (db: ModuleDb): string => {
  const row = db
    .select()
    .from(settings)
    .where(eq(settings.key, "home_timezone"))
    .get();
  return row?.value ?? "UTC";
};

const currentYear = (now: number): number => new Date(now).getUTCFullYear();

const sessionState = (
  now: number,
  dateStart: string | null,
  dateEnd: string | null,
): SessionState => {
  if (dateStart === null) {
    return "upcoming";
  }
  const start = Date.parse(dateStart);
  if (Number.isNaN(start)) {
    return "upcoming";
  }
  if (now < start) {
    return "upcoming";
  }
  const endMs =
    dateEnd === null || Number.isNaN(Date.parse(dateEnd))
      ? start + SESSION_FALLBACK_MS
      : Date.parse(dateEnd);
  return now > endMs ? "done" : "live";
};

type F1SessionRow = typeof f1Sessions.$inferSelect;

const toSessionLite = (now: number, row: F1SessionRow): SessionLite => ({
  entityId: row.entityId,
  sessionKey: row.sessionKey,
  sessionName: row.sessionName,
  sessionType: row.sessionType,
  dateStart: row.dateStart,
  dateEnd: row.dateEnd,
  state: sessionState(now, row.dateStart, row.dateEnd),
});

const weekendState = (sessions: readonly SessionLite[]): SessionState => {
  if (sessions.some((s) => s.state === "live")) {
    return "live";
  }
  if (sessions.every((s) => s.state === "done")) {
    return "done";
  }
  return "upcoming";
};

/** Groups the season's synced sessions into ordered weekends. */
const buildSchedule = (db: ModuleDb, now: number): SeasonSchedule => {
  const year = currentYear(now);
  const rows = db
    .select()
    .from(f1Sessions)
    .where(eq(f1Sessions.year, year))
    .orderBy(asc(f1Sessions.dateStart))
    .all();

  const byMeeting = new Map<number, F1SessionRow[]>();
  for (const row of rows) {
    const list = byMeeting.get(row.meetingKey) ?? [];
    list.push(row);
    byMeeting.set(row.meetingKey, list);
  }

  const ordered = [...byMeeting.entries()].sort((a, b) => {
    const aStart = a[1][0]?.dateStart ?? "";
    const bStart = b[1][0]?.dateStart ?? "";
    return aStart.localeCompare(bStart);
  });

  const weekends: Weekend[] = ordered.map(([meetingKey, list], index) => {
    const first = list[0];
    const sessions = list.map((row) => toSessionLite(now, row));
    const dateStart = list[0]?.dateStart ?? null;
    const dateEnd = list[list.length - 1]?.dateEnd ?? null;
    return {
      meetingKey,
      meetingName: first?.meetingName ?? null,
      countryName: first?.countryName ?? null,
      countryCode: first?.countryCode ?? null,
      countryFlagUrl: first?.countryFlagUrl ?? null,
      circuitShortName: first?.circuitShortName ?? null,
      circuitImageUrl: first?.circuitImageUrl ?? null,
      circuitInfoUrl: first?.circuitInfoUrl ?? null,
      location: first?.location ?? null,
      dateStart,
      dateEnd,
      round: index + 1,
      state: weekendState(sessions),
      sessions,
    };
  });

  return { year, weekends };
};

const findNextUp = (schedule: SeasonSchedule): NextUp => {
  for (const weekend of schedule.weekends) {
    for (const session of weekend.sessions) {
      if (session.state === "upcoming" || session.state === "live") {
        return { session, weekend };
      }
    }
  }
  return { session: null, weekend: null };
};

// --- fetch-on-view: drivers + results + standings -------------------------

const globalFetch: FetchLike = (input, init) => fetch(input, init);

const ensureDrivers = async (
  db: ModuleDb,
  fetchImpl: FetchLike,
  sessionKey: number,
): Promise<void> => {
  const existing = db
    .select({ n: f1Drivers.driverNumber })
    .from(f1Drivers)
    .where(eq(f1Drivers.sessionKey, sessionKey))
    .all();
  if (existing.length > 0) {
    return;
  }
  const rows = await fetchRows(fetchImpl, `drivers?session_key=${sessionKey}`);
  for (const row of rows) {
    const driverNumber = asNumber(row.driver_number);
    if (driverNumber === null) {
      continue;
    }
    const values = {
      sessionKey,
      driverNumber,
      meetingKey: asNumber(row.meeting_key),
      fullName: asString(row.full_name),
      broadcastName: asString(row.broadcast_name),
      firstName: asString(row.first_name),
      lastName: asString(row.last_name),
      nameAcronym: asString(row.name_acronym),
      teamName: asString(row.team_name),
      teamColour: asString(row.team_colour),
      headshotUrl: asString(row.headshot_url),
      countryCode: asString(row.country_code),
    };
    db.insert(f1Drivers)
      .values(values)
      .onConflictDoUpdate({
        target: [f1Drivers.sessionKey, f1Drivers.driverNumber],
        set: values,
      })
      .run();
  }
};

const ensureResults = async (
  db: ModuleDb,
  fetchImpl: FetchLike,
  sessionKey: number,
): Promise<void> => {
  const existing = db
    .select({ n: f1SessionResults.driverNumber })
    .from(f1SessionResults)
    .where(eq(f1SessionResults.sessionKey, sessionKey))
    .all();
  if (existing.length > 0) {
    return;
  }
  const rows = await fetchRows(
    fetchImpl,
    `session_result?session_key=${sessionKey}`,
  );
  for (const row of rows) {
    const driverNumber = asNumber(row.driver_number);
    if (driverNumber === null) {
      continue;
    }
    const values = {
      sessionKey,
      driverNumber,
      position: asNumber(row.position),
      points: asNumber(row.points),
      dnf: asBool(row.dnf) ? 1 : 0,
      dns: asBool(row.dns) ? 1 : 0,
      dsq: asBool(row.dsq) ? 1 : 0,
      duration: asNumber(row.duration),
      gapToLeader: asGap(row.gap_to_leader),
      numberOfLaps: asNumber(row.number_of_laps),
    };
    db.insert(f1SessionResults)
      .values(values)
      .onConflictDoUpdate({
        target: [f1SessionResults.sessionKey, f1SessionResults.driverNumber],
        set: values,
      })
      .run();
  }
};

type DriverRow = typeof f1Drivers.$inferSelect;

const driverIndex = (
  db: ModuleDb,
  sessionKey: number,
): Map<number, DriverRow> => {
  const map = new Map<number, DriverRow>();
  for (const row of db
    .select()
    .from(f1Drivers)
    .where(eq(f1Drivers.sessionKey, sessionKey))
    .all()) {
    map.set(row.driverNumber, row);
  }
  return map;
};

const readSessionResult = (db: ModuleDb, sessionKey: number): SessionResult => {
  const session = db
    .select()
    .from(f1Sessions)
    .where(eq(f1Sessions.sessionKey, sessionKey))
    .get();
  const drivers = driverIndex(db, sessionKey);
  const rows: ResultRow[] = db
    .select()
    .from(f1SessionResults)
    .where(eq(f1SessionResults.sessionKey, sessionKey))
    .all()
    .map((r) => {
      const d = drivers.get(r.driverNumber);
      return {
        position: r.position,
        driverNumber: r.driverNumber,
        fullName: d?.fullName ?? null,
        nameAcronym: d?.nameAcronym ?? null,
        teamName: d?.teamName ?? null,
        teamColour: d?.teamColour ?? null,
        headshotUrl: d?.headshotUrl ?? null,
        points: r.points,
        dnf: r.dnf === 1,
        dns: r.dns === 1,
        dsq: r.dsq === 1,
        gapToLeader: r.gapToLeader,
        numberOfLaps: r.numberOfLaps,
      };
    })
    .sort((a, b) => {
      // Classified positions first (ascending), DNFs (null) last.
      if (a.position === null && b.position === null) return 0;
      if (a.position === null) return 1;
      if (b.position === null) return -1;
      return a.position - b.position;
    });
  return {
    sessionKey,
    sessionName: session?.sessionName ?? "Session",
    sessionType: session?.sessionType ?? "",
    meetingName: session?.meetingName ?? null,
    rows,
  };
};

/** The most recent race/sprint session that has finished, or null. */
const latestFinishedRaceKey = (db: ModuleDb, now: number): number | null => {
  const rows = db
    .select()
    .from(f1Sessions)
    .where(eq(f1Sessions.year, currentYear(now)))
    .orderBy(asc(f1Sessions.dateStart))
    .all();
  let key: number | null = null;
  for (const row of rows) {
    if (
      row.sessionType === "Race" &&
      sessionState(now, row.dateStart, row.dateEnd) === "done"
    ) {
      key = row.sessionKey;
    }
  }
  return key;
};

const ensureStandings = async (
  db: ModuleDb,
  fetchImpl: FetchLike,
  sessionKey: number,
): Promise<void> => {
  const existing = db
    .select({ n: f1StandingsDrivers.driverNumber })
    .from(f1StandingsDrivers)
    .where(eq(f1StandingsDrivers.sessionKey, sessionKey))
    .all();
  if (existing.length === 0) {
    const rows = await fetchRows(
      fetchImpl,
      `championship_drivers?session_key=${sessionKey}`,
    );
    for (const row of rows) {
      const driverNumber = asNumber(row.driver_number);
      if (driverNumber === null) continue;
      const values = {
        sessionKey,
        driverNumber,
        positionCurrent: asNumber(row.position_current),
        positionStart: asNumber(row.position_start),
        pointsCurrent: asNumber(row.points_current),
        pointsStart: asNumber(row.points_start),
      };
      db.insert(f1StandingsDrivers)
        .values(values)
        .onConflictDoUpdate({
          target: [
            f1StandingsDrivers.sessionKey,
            f1StandingsDrivers.driverNumber,
          ],
          set: values,
        })
        .run();
    }
  }
  const teams = db
    .select({ t: f1StandingsTeams.teamName })
    .from(f1StandingsTeams)
    .where(eq(f1StandingsTeams.sessionKey, sessionKey))
    .all();
  if (teams.length === 0) {
    const rows = await fetchRows(
      fetchImpl,
      `championship_teams?session_key=${sessionKey}`,
    );
    for (const row of rows) {
      const teamName = asString(row.team_name);
      if (teamName === null) continue;
      const values = {
        sessionKey,
        teamName,
        positionCurrent: asNumber(row.position_current),
        positionStart: asNumber(row.position_start),
        pointsCurrent: asNumber(row.points_current),
        pointsStart: asNumber(row.points_start),
      };
      db.insert(f1StandingsTeams)
        .values(values)
        .onConflictDoUpdate({
          target: [f1StandingsTeams.sessionKey, f1StandingsTeams.teamName],
          set: values,
        })
        .run();
    }
  }
};

const readDriverStandings = (
  db: ModuleDb,
  sessionKey: number,
): DriverStanding[] => {
  const drivers = driverIndex(db, sessionKey);
  return db
    .select()
    .from(f1StandingsDrivers)
    .where(eq(f1StandingsDrivers.sessionKey, sessionKey))
    .all()
    .map((r) => {
      const d = drivers.get(r.driverNumber);
      return {
        driverNumber: r.driverNumber,
        fullName: d?.fullName ?? null,
        nameAcronym: d?.nameAcronym ?? null,
        teamName: d?.teamName ?? null,
        teamColour: d?.teamColour ?? null,
        headshotUrl: d?.headshotUrl ?? null,
        position: r.positionCurrent,
        points: r.pointsCurrent,
        positionStart: r.positionStart,
        pointsStart: r.pointsStart,
      };
    })
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
};

const readTeamStandings = (
  db: ModuleDb,
  sessionKey: number,
): TeamStanding[] => {
  // Team colour comes from any driver on that team in the session.
  const colours = new Map<string, string | null>();
  for (const d of db
    .select()
    .from(f1Drivers)
    .where(eq(f1Drivers.sessionKey, sessionKey))
    .all()) {
    if (d.teamName !== null && !colours.has(d.teamName)) {
      colours.set(d.teamName, d.teamColour);
    }
  }
  return db
    .select()
    .from(f1StandingsTeams)
    .where(eq(f1StandingsTeams.sessionKey, sessionKey))
    .all()
    .map((r) => ({
      teamName: r.teamName,
      teamColour: colours.get(r.teamName) ?? null,
      position: r.positionCurrent,
      points: r.pointsCurrent,
      positionStart: r.positionStart,
      pointsStart: r.pointsStart,
    }))
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
};

// --- boards ---------------------------------------------------------------

const widgetInstanceSchema = z.object({
  instanceId: z.string().min(1),
  type: z.string().min(1),
  size: z.enum(["s", "m", "l"]),
  config: z.record(z.string(), z.unknown()),
});

const layoutSchema = z.array(widgetInstanceSchema);

const parseLayout = (raw: string): WidgetInstance[] => {
  try {
    const parsed = layoutSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
};

const w = (
  type: string,
  size: "s" | "m" | "l",
  seed: number,
  config: Record<string, unknown> = {},
): WidgetInstance => ({
  instanceId: `${seed}-${type}`,
  type,
  size,
  config,
});

/** The boards a fresh install starts with, so F1 is useful immediately. */
const defaultBoards = (
  now: number,
): { name: string; layout: WidgetInstance[] }[] => [
  {
    name: "Season",
    layout: [
      w("next-race", "l", now),
      w("weekend-schedule", "m", now),
      w("driver-standings", "m", now),
      w("constructor-standings", "m", now),
      w("latest-result", "l", now),
      w("calendar", "l", now),
    ],
  },
];

const seedBoards = (db: ModuleDb, now: number): void => {
  defaultBoards(now).forEach((board, index) => {
    db.insert(f1Boards)
      .values({
        id: `${now}-${index}`,
        name: board.name,
        sortOrder: index,
        layout: JSON.stringify(board.layout),
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
};

const readBoards = (db: ModuleDb): Board[] =>
  db
    .select()
    .from(f1Boards)
    .orderBy(asc(f1Boards.sortOrder))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sortOrder,
      layout: parseLayout(row.layout),
    }));

// --- router ---------------------------------------------------------------

export const f1Router = moduleRouter({
  schedule: protectedProcedure.query(({ ctx }) => {
    const schedule = buildSchedule(ctx.db, ctx.now());
    return { ...schedule, homeTimezone: readHomeTimezone(ctx.db) };
  }),

  nextUp: protectedProcedure.query(({ ctx }): NextUp => {
    return findNextUp(buildSchedule(ctx.db, ctx.now()));
  }),

  sessionResult: protectedProcedure
    .input(z.object({ sessionKey: z.number().int() }))
    .query(async ({ ctx, input }): Promise<SessionResult> => {
      await ensureDrivers(ctx.db, globalFetch, input.sessionKey);
      await ensureResults(ctx.db, globalFetch, input.sessionKey);
      return readSessionResult(ctx.db, input.sessionKey);
    }),

  latestResult: protectedProcedure.query(
    async ({ ctx }): Promise<SessionResult | null> => {
      const key = latestFinishedRaceKey(ctx.db, ctx.now());
      if (key === null) {
        return null;
      }
      await ensureDrivers(ctx.db, globalFetch, key);
      await ensureResults(ctx.db, globalFetch, key);
      return readSessionResult(ctx.db, key);
    },
  ),

  driverStandings: protectedProcedure
    .input(z.object({ sessionKey: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }): Promise<DriverStanding[]> => {
      const key = input?.sessionKey ?? latestFinishedRaceKey(ctx.db, ctx.now());
      if (key === null) {
        return [];
      }
      await ensureDrivers(ctx.db, globalFetch, key);
      await ensureStandings(ctx.db, globalFetch, key);
      return readDriverStandings(ctx.db, key);
    }),

  constructorStandings: protectedProcedure
    .input(z.object({ sessionKey: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }): Promise<TeamStanding[]> => {
      const key = input?.sessionKey ?? latestFinishedRaceKey(ctx.db, ctx.now());
      if (key === null) {
        return [];
      }
      await ensureDrivers(ctx.db, globalFetch, key);
      await ensureStandings(ctx.db, globalFetch, key);
      return readTeamStandings(ctx.db, key);
    }),

  boards: moduleRouter({
    list: protectedProcedure.query(({ ctx }): Board[] => {
      const boards = readBoards(ctx.db);
      if (boards.length > 0) {
        return boards;
      }
      seedBoards(ctx.db, ctx.now());
      return readBoards(ctx.db);
    }),

    create: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(60) }))
      .mutation(({ ctx, input }): Board => {
        const now = ctx.now();
        const count = ctx.db.select().from(f1Boards).all().length;
        const id = `${now}-${count}`;
        ctx.db
          .insert(f1Boards)
          .values({
            id,
            name: input.name,
            sortOrder: count,
            layout: "[]",
            createdAt: now,
            updatedAt: now,
          })
          .run();
        return { id, name: input.name, sortOrder: count, layout: [] };
      }),

    rename: protectedProcedure
      .input(
        z.object({ id: z.string(), name: z.string().trim().min(1).max(60) }),
      )
      .mutation(({ ctx, input }) => {
        ctx.db
          .update(f1Boards)
          .set({ name: input.name, updatedAt: ctx.now() })
          .where(eq(f1Boards.id, input.id))
          .run();
        return { ok: true as const };
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ ctx, input }) => {
        ctx.db.delete(f1Boards).where(eq(f1Boards.id, input.id)).run();
        return { ok: true as const };
      }),

    saveLayout: protectedProcedure
      .input(z.object({ id: z.string(), layout: layoutSchema }))
      .mutation(({ ctx, input }) => {
        ctx.db
          .update(f1Boards)
          .set({
            layout: JSON.stringify(input.layout),
            updatedAt: ctx.now(),
          })
          .where(eq(f1Boards.id, input.id))
          .run();
        return { ok: true as const };
      }),
  }),
});

export type F1Router = typeof f1Router;
