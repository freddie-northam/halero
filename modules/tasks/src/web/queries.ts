// The module's react-query keys and the invalidation wrapper the host
// registry applies to its TasksApi. The keys never leave this module:
// the host holds the QueryClient and calls the wrapper, so core code
// never learns (or hardcodes) module cache shapes.

import type { QueryClient } from "@tanstack/react-query";
import type { TaskFilter } from "../contract";
import type { TasksApi } from "./api";

const tasksRootKey = ["tasks"] as const;

export const tasksListKey = (filter: TaskFilter) =>
  [...tasksRootKey, "list", filter] as const;

export const tasksTodayKey = [...tasksRootKey, "today"] as const;

export const tasksBoardKey = [...tasksRootKey, "board"] as const;

/**
 * Wraps a TasksApi so every successful mutation invalidates the module's
 * queries (list under every filter, the board, and the today view) and
 * resolves only after active ones refetched. No optimistic updates:
 * invalidate-and-refetch keeps every surface consistent, including the
 * board after a drag.
 */
export const withTasksInvalidation = (
  api: TasksApi,
  queryClient: QueryClient,
): TasksApi => {
  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: tasksRootKey });
  };
  return {
    list: api.list,
    today: api.today,
    board: api.board,
    create: async (input) => {
      const task = await api.create(input);
      await invalidate();
      return task;
    },
    update: async (input) => {
      const task = await api.update(input);
      await invalidate();
      return task;
    },
    move: async (input) => {
      const task = await api.move(input);
      await invalidate();
      return task;
    },
    toggle: async (entityId) => {
      const task = await api.toggle(entityId);
      await invalidate();
      return task;
    },
    delete: async (entityId) => {
      const result = await api.delete(entityId);
      await invalidate();
      return result;
    },
    logTime: async (input) => {
      const task = await api.logTime(input);
      await invalidate();
      return task;
    },
  };
};
