// Argument shaping for the Add Task command. Values reach the server
// as-is beyond trivial emptiness: modules.tasks.create owns validation
// and its rejections already carry readable messages.

// A type alias (not an interface) so it satisfies Raycast's Arguments
// constraint via the implicit index signature (the api.ts precedent).
export type AddTaskArguments = {
  title: string;
  /** Optional YYYY-MM-DD due date; the server validates the format. */
  due?: string;
};

export interface TaskCreateInput {
  readonly title: string;
  readonly dueDate?: string;
}

/** A blank due argument means "no due date"; anything else is sent for
 * the server to accept or reject with its readable message. */
export const taskCreateInput = (args: AddTaskArguments): TaskCreateInput => {
  const due = (args.due ?? "").trim();
  return due === ""
    ? { title: args.title }
    : { title: args.title, dueDate: due };
};
