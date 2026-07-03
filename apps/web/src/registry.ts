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

/** Core-owned navigation. Settings stays core; modules slot in around it. */
const coreNav: readonly NavContribution[] = [
  { label: "Settings", path: "/settings", order: 100 },
];

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

/** The web modules this build ships with, wired to the server clients. */
export const buildWebModules = (
  client: TrpcClient,
  api: HaleroApi,
  queryClient: QueryClient,
): readonly WebModule[] => {
  const calendarApi = buildCalendarApi(client, queryClient);
  const tasksApi = buildTasksApi(client, queryClient);
  return [
    createTodayWebModule({
      api: {
        // The greeting and date line reuse the calendar module's today
        // anchor, which already carries the home timezone and its current
        // date; no dedicated server endpoint exists for the Today page.
        home: () => client.modules.calendar.today.query(),
        googleConnectionStatus: async () =>
          (await api.googleStatus()).connection?.status ?? null,
      },
      sections: buildTodaySections(calendarApi, tasksApi),
    }),
    createCalendarWebModule(calendarApi),
    createTasksWebModule(tasksApi),
  ];
};

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
