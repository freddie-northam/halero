// What the tasks web surfaces need from the host: the module's own tRPC
// procedures, wired up by the app registry. Mirrors CalendarApi.

import type {
  Task,
  TaskBoard,
  TaskFilter,
  TaskList,
  TaskPriority,
  TaskStatus,
  TasksToday,
} from "../contract";

export interface TaskUpdateInput {
  readonly entityId: string;
  readonly title?: string;
  readonly dueDate?: string | null;
  readonly notes?: string | null;
  readonly priority?: TaskPriority | null;
  readonly tags?: readonly string[];
  readonly estimateMinutes?: number | null;
}

export interface TaskMoveInput {
  readonly entityId: string;
  readonly status: TaskStatus;
  readonly sortOrder: number;
}

export interface TaskLogTimeInput {
  readonly entityId: string;
  /** Non-zero whole minutes; negative corrects an over-log. */
  readonly minutes: number;
}

export interface TasksApi {
  readonly list: (filter: TaskFilter) => Promise<TaskList>;
  readonly today: () => Promise<TasksToday>;
  readonly board: () => Promise<TaskBoard>;
  readonly create: (input: {
    readonly title: string;
    readonly dueDate?: string;
  }) => Promise<Task>;
  readonly update: (input: TaskUpdateInput) => Promise<Task>;
  readonly move: (input: TaskMoveInput) => Promise<Task>;
  readonly toggle: (entityId: string) => Promise<Task>;
  readonly delete: (entityId: string) => Promise<{ entityId: string }>;
  readonly logTime: (input: TaskLogTimeInput) => Promise<Task>;
}
