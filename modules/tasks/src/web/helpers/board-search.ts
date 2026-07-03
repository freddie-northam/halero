// The /tasks URL is the view state: ?view=board|list. Board is the
// default (unlike calendar's agenda default), and this normalizer runs
// as both the route's validateSearch and inside the screen, so a
// hand-typed or stale URL always lands on something renderable.

export type TasksView = "board" | "list";

export type TasksSearch = {
  readonly view: TasksView;
};

const isTasksView = (value: unknown): value is TasksView =>
  value === "board" || value === "list";

/** Drops anything unrenderable; an unknown or missing view falls back to board. */
export const normalizeTasksSearch = (search: unknown): TasksSearch => {
  if (typeof search !== "object" || search === null) {
    return { view: "board" };
  }
  const record = search as Record<string, unknown>;
  return { view: isTasksView(record.view) ? record.view : "board" };
};
