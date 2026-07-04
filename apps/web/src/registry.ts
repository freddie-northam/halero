// The compile-time web module registry: the ONE place the web app names
// the modules this build ships and wires their host-side dependencies.
// Router and sidebar build from it; core never imports module code
// anywhere else.

import {
  type CalendarApi,
  createCalendarWebModule,
  createTodayAgendaSection,
  withCalendarInvalidation,
} from "@halero/module-calendar/web";
import {
  createF1WebModule,
  type F1Api,
  withF1Invalidation,
} from "@halero/module-f1/web";
import {
  createNotesWebModule,
  type NotesApi,
  withNotesInvalidation,
} from "@halero/module-notes/web";
import {
  createProgressWebModule,
  type ProgressApi,
  withProgressInvalidation,
} from "@halero/module-progress/web";
import type {
  CommandContribution,
  EntityLinkContribution,
  NavContribution,
  WebModule,
} from "@halero/module-sdk/web";
import {
  createTasksTodaySection,
  createTasksWebModule,
  type TasksApi,
  withTasksInvalidation,
} from "@halero/module-tasks/web";
import {
  createTodayWebModule,
  type TodaySection,
} from "@halero/module-today/web";
import type { QueryClient } from "@tanstack/react-query";
import type { HaleroApi } from "./lib/api";
import type { TrpcClient } from "./lib/trpc";

// Settings is reached from the top-right avatar in the shell, not the
// sidebar, so core contributes no nav entries; modules own the sidebar.
const coreNav: readonly NavContribution[] = [];

/**
 * The Today page's sections, hardcoded per the v0.1 plan's YAGNI call:
 * no generic contribution-point framework yet. The array already has the
 * contribution shape (id, order, component), so when the contribution
 * mechanism arrives modules will declare their sections themselves and
 * this list disappears without touching module code.
 */
export const buildTodaySections = (
  calendarApi: CalendarApi,
  tasksApi: TasksApi,
): readonly TodaySection[] => [
  {
    id: "calendar.agenda",
    order: 10,
    component: createTodayAgendaSection(calendarApi),
  },
  {
    id: "tasks.dueToday",
    order: 20,
    component: createTasksTodaySection(tasksApi),
  },
];

/**
 * The calendar seam: the module's procedures off the tRPC client,
 * wrapped with the module's own invalidation helper so every create,
 * update, or delete refreshes the calendar queries through the
 * host-held QueryClient. The query keys stay inside the module; core
 * only holds the client.
 */
export const buildCalendarApi = (
  client: TrpcClient,
  queryClient: QueryClient,
): CalendarApi =>
  withCalendarInvalidation(
    {
      today: () => client.modules.calendar.today.query(),
      range: (from, to) => client.modules.calendar.range.query({ from, to }),
      events: (from, to) => client.modules.calendar.events.query({ from, to }),
      upcoming: (limit) =>
        client.modules.calendar.upcoming.query(
          limit === undefined ? undefined : { limit },
        ),
      createEvent: (input) => client.modules.calendar.createEvent.mutate(input),
      updateEvent: (input) => client.modules.calendar.updateEvent.mutate(input),
      deleteEvent: (entityId) =>
        client.modules.calendar.deleteEvent.mutate({ entityId }),
    },
    queryClient,
  );

/**
 * The tasks seam: the module's procedures off the tRPC client, wrapped
 * with the module's own invalidation helper so every mutation refreshes
 * the tasks queries through the host-held QueryClient. The query keys
 * stay inside the module; core only holds the client.
 */
export const buildTasksApi = (
  client: TrpcClient,
  queryClient: QueryClient,
): TasksApi =>
  withTasksInvalidation(
    {
      list: (filter) => client.modules.tasks.list.query({ filter }),
      today: () => client.modules.tasks.today.query(),
      board: () => client.modules.tasks.board.query(),
      create: (input) => client.modules.tasks.create.mutate(input),
      // The tRPC input schema wants a mutable string[]; the module's
      // TaskUpdateInput keeps tags readonly, so it is copied at the seam.
      update: (input) =>
        client.modules.tasks.update.mutate({
          entityId: input.entityId,
          title: input.title,
          dueDate: input.dueDate,
          notes: input.notes,
          priority: input.priority,
          tags: input.tags === undefined ? undefined : [...input.tags],
          estimateMinutes: input.estimateMinutes,
        }),
      move: (input) => client.modules.tasks.move.mutate(input),
      toggle: (entityId) => client.modules.tasks.toggle.mutate({ entityId }),
      delete: (entityId) => client.modules.tasks.delete.mutate({ entityId }),
      logTime: (input) => client.modules.tasks.logTime.mutate(input),
    },
    queryClient,
  );

/**
 * The notes seam: the module's procedures off the tRPC client, wrapped
 * with the module's own invalidation helper. The document and tags are
 * copied to mutable arrays at the boundary, since the tRPC input schemas
 * want mutable arrays while the module keeps them readonly.
 */
export const buildNotesApi = (
  client: TrpcClient,
  queryClient: QueryClient,
): NotesApi =>
  withNotesInvalidation(
    {
      list: () => client.modules.notes.list.query(),
      get: (entityId) => client.modules.notes.get.query({ entityId }),
      create: (input) =>
        client.modules.notes.create.mutate({
          title: input.title,
          document:
            input.document === undefined ? undefined : [...input.document],
        }),
      update: (input) =>
        client.modules.notes.update.mutate({
          entityId: input.entityId,
          title: input.title,
          document:
            input.document === undefined ? undefined : [...input.document],
          tags: input.tags === undefined ? undefined : [...input.tags],
        }),
      delete: (entityId) => client.modules.notes.delete.mutate({ entityId }),
    },
    queryClient,
  );

/**
 * The F1 seam: the module's procedures off the tRPC client, wrapped with
 * its own invalidation helper so board edits refresh the board list. The
 * board layout is copied to a mutable array at the boundary, since the
 * tRPC input schema wants a mutable array while the module keeps it
 * readonly.
 */
export const buildF1Api = (
  client: TrpcClient,
  queryClient: QueryClient,
): F1Api =>
  withF1Invalidation(
    {
      schedule: () => client.modules.f1.schedule.query(),
      nextUp: () => client.modules.f1.nextUp.query(),
      sessionResult: (input) => client.modules.f1.sessionResult.query(input),
      latestResult: () => client.modules.f1.latestResult.query(),
      driverStandings: (input) =>
        client.modules.f1.driverStandings.query(input),
      constructorStandings: (input) =>
        client.modules.f1.constructorStandings.query(input),
      raceSessions: () => client.modules.f1.raceSessions.query(),
      laps: (input) => client.modules.f1.laps.query(input),
      stints: (input) => client.modules.f1.stints.query(input),
      pits: (input) => client.modules.f1.pits.query(input),
      positions: (input) => client.modules.f1.positions.query(input),
      raceControl: (input) => client.modules.f1.raceControl.query(input),
      teamRadio: (input) => client.modules.f1.teamRadio.query(input),
      overtakes: (input) => client.modules.f1.overtakes.query(input),
      weather: (input) => client.modules.f1.weather.query(input),
      startingGrid: (input) => client.modules.f1.startingGrid.query(input),
      live: {
        status: () => client.f1Live.status.query(),
        connect: (input) => client.f1Live.connect.mutate(input),
        disconnect: () => client.f1Live.disconnect.mutate(),
        session: () => client.f1Live.session.query(),
        timing: () => client.f1Live.timing.query(),
        weather: () => client.f1Live.weather.query(),
      },
      boards: {
        list: () => client.modules.f1.boards.list.query(),
        create: (input) => client.modules.f1.boards.create.mutate(input),
        rename: (input) => client.modules.f1.boards.rename.mutate(input),
        remove: (input) => client.modules.f1.boards.remove.mutate(input),
        saveLayout: (input) =>
          client.modules.f1.boards.saveLayout.mutate({
            id: input.id,
            layout: [...input.layout],
          }),
      },
    },
    queryClient,
  );

/** The web modules this build ships with, wired to the server clients. */
export const buildWebModules = (
  client: TrpcClient,
  api: HaleroApi,
  queryClient: QueryClient,
): readonly WebModule[] => {
  const calendarApi = buildCalendarApi(client, queryClient);
  const tasksApi = buildTasksApi(client, queryClient);
  const notesApi = buildNotesApi(client, queryClient);
  const progressApi = buildProgressApi(client, queryClient);
  const f1Api = buildF1Api(client, queryClient);
  return [
    createTodayWebModule({
      api: {
        // The greeting and date line reuse the calendar module's today
        // anchor (home timezone + current date); the owner's name for the
        // greeting comes from system.status, merged in here.
        home: async () => {
          const [today, status] = await Promise.all([
            client.modules.calendar.today.query(),
            client.system.status.query(),
          ]);
          return { ...today, displayName: status.displayName };
        },
        // Settings' connection framework replaced api.googleStatus(); the
        // Today card reads Google's status off the generic catalog now.
        googleConnectionStatus: async () => {
          const catalog = await api.connectionsCatalog();
          return (
            catalog.find((item) => item.id === "google-calendar")?.connection
              ?.status ?? null
          );
        },
      },
      sections: buildTodaySections(calendarApi, tasksApi),
    }),
    createCalendarWebModule(calendarApi),
    createTasksWebModule(tasksApi),
    createNotesWebModule(notesApi),
    createProgressWebModule(progressApi),
    createF1WebModule(f1Api),
  ];
};

/**
 * The progress seam: the module's procedures off the tRPC client, wrapped
 * with its own invalidation helper so refresh refreshes the heatmap.
 */
export const buildProgressApi = (
  client: TrpcClient,
  queryClient: QueryClient,
): ProgressApi =>
  withProgressInvalidation(
    {
      status: () => client.progress.status.query(),
      heatmap: (range, source) =>
        client.progress.heatmap.query({ range, source }),
      refresh: () => client.progress.refresh.mutate(),
    },
    queryClient,
  );

const duplicateEntityLinkMessage = (
  kind: string,
  owner: string,
  claimant: string,
): string =>
  `The "${claimant}" module links the entity kind "${kind}", but the ` +
  `"${owner}" module already links it. Each entity kind can be linked ` +
  "by exactly one module.";

/**
 * Entity link index by kind, validated like the server's kind registry:
 * two modules claiming the same kind is a build mistake and fails
 * loudly at boot (createAppRouter builds this map at startup), before
 * the command palette can route a hit ambiguously.
 */
export const buildEntityLinks = (
  modules: readonly WebModule[],
): ReadonlyMap<string, EntityLinkContribution> => {
  const links = new Map<string, EntityLinkContribution>();
  const owners = new Map<string, string>();
  for (const module of modules) {
    for (const link of module.entityLinks ?? []) {
      const owner = owners.get(link.kind);
      if (owner !== undefined) {
        throw new Error(
          duplicateEntityLinkMessage(link.kind, owner, module.id),
        );
      }
      owners.set(link.kind, module.id);
      links.set(link.kind, link);
    }
  }
  return links;
};

const duplicateCommandMessage = (
  id: string,
  owner: string,
  claimant: string,
): string =>
  `The "${claimant}" module contributes the command "${id}", but the ` +
  `"${owner}" module already contributes it. Each command id can ` +
  "belong to exactly one module.";

/**
 * Palette commands in module order, validated like entity links: two
 * modules claiming one command id is a build mistake and fails loudly
 * at boot (createAppRouter builds this list at startup), before the
 * palette can run an ambiguous command.
 */
export const buildCommands = (
  modules: readonly WebModule[],
): readonly CommandContribution[] => {
  const owners = new Map<string, string>();
  const commands: CommandContribution[] = [];
  for (const module of modules) {
    for (const command of module.commands ?? []) {
      const owner = owners.get(command.id);
      if (owner !== undefined) {
        throw new Error(duplicateCommandMessage(command.id, owner, module.id));
      }
      owners.set(command.id, module.id);
      commands.push(command);
    }
  }
  return commands;
};

/** Full nav (core plus module contributions), sorted by order. */
export const buildNav = (
  modules: readonly WebModule[],
): readonly NavContribution[] =>
  [...coreNav, ...modules.flatMap((module) => module.nav ?? [])].toSorted(
    (a, b) => a.order - b.order,
  );
