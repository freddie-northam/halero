// The tasks module's own API contract: the task shapes its server
// router returns and its web page (Task 10) will consume. Pure types so
// both entries can import them without dragging the other side's
// dependencies along.

export interface Task {
  readonly entityId: string;
  readonly title: string;
  readonly status: "open" | "done";
  /** Calendar date ("YYYY-MM-DD") in the home timezone, or null. */
  readonly dueDate: string | null;
  readonly notes: string | null;
  /** Epoch ms of the completing toggle; null while open. */
  readonly completedAt: number | null;
}

/** The list procedure's filter values; "open" is the page default. */
export type TaskFilter = "open" | "done" | "all";

export interface TaskList {
  readonly tasks: readonly Task[];
}

/**
 * Open tasks due today or overdue, anchored to the server-computed
 * "today"; the client never does timezone math.
 */
export interface TasksToday {
  readonly homeTimezone: string;
  /** Calendar date ("YYYY-MM-DD") of now in the home timezone. */
  readonly today: string;
  readonly tasks: readonly Task[];
}
