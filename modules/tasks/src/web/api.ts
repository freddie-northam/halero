// What the tasks web surfaces need from the host: the module's own tRPC
// procedures, wired up by the app registry. Mirrors CalendarApi.

import type { Task, TaskFilter, TaskList, TasksToday } from "../contract";

export interface TasksApi {
  readonly list: (filter: TaskFilter) => Promise<TaskList>;
  readonly today: () => Promise<TasksToday>;
  readonly create: (input: {
    readonly title: string;
    readonly dueDate?: string;
  }) => Promise<Task>;
  readonly toggle: (entityId: string) => Promise<Task>;
  readonly delete: (entityId: string) => Promise<{ entityId: string }>;
}
