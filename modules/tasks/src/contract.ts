// The tasks module's own API contract: the task shapes its server
// router returns and its web page (Task 10) will consume. Pure types so
// both entries can import them without dragging the other side's
// dependencies along.

export interface Task {
  readonly entityId: string;
  readonly title: string;
  /** Board statuses since migration 0006; legacy "open" became "todo". */
  readonly status: "todo" | "doing" | "done";
  /** Calendar date ("YYYY-MM-DD") in the home timezone, or null. */
  readonly dueDate: string | null;
  readonly notes: string | null;
  /** Epoch ms of the completing toggle; null while not done. */
  readonly completedAt: number | null;
}

/** The list procedure's filter values; "todo" is the page default. */
export type TaskFilter = "todo" | "done" | "all";

export interface TaskList {
  readonly tasks: readonly Task[];
}

/**
 * Non-done tasks due today or overdue, anchored to the server-computed
 * "today"; the client never does timezone math.
 */
export interface TasksToday {
  readonly homeTimezone: string;
  /** Calendar date ("YYYY-MM-DD") of now in the home timezone. */
  readonly today: string;
  readonly tasks: readonly Task[];
}
