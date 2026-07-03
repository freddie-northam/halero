// One task row: status checkbox, title, notes marker, due date, and the
// hover/focus delete affordance. The due-date tint compares two
// server-derived calendar dates; the row never reads the client clock.

import { Button, Checkbox, cn, StickyNote, X } from "@halero/ui";
import type { ReactElement } from "react";
import type { Task } from "../../contract";
import { formatDueDate, isDueOrOverdue } from "../helpers/due-date";

export interface TaskRowProps {
  readonly task: Task;
  /** The server-computed today (home timezone), for the overdue tint. */
  readonly today: string;
  readonly onToggle: (entityId: string) => void;
  readonly onDelete: (entityId: string) => void;
}

const NotesMarker = (): ReactElement => (
  <span className="shrink-0 text-muted-foreground" title="Has notes">
    <StickyNote aria-hidden="true" className="size-3.5" />
    <span className="sr-only">Has notes</span>
  </span>
);

const DueDate = ({
  task,
  today,
}: {
  readonly task: Task;
  readonly today: string;
}): ReactElement | null => {
  if (task.dueDate === null) {
    return null;
  }
  const slipping =
    task.status !== "done" && isDueOrOverdue(task.dueDate, today);
  return (
    <span
      className={cn(
        "tnum shrink-0 text-xs",
        slipping ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {formatDueDate(task.dueDate, today)}
    </span>
  );
};

export const TaskRow = ({
  task,
  today,
  onToggle,
  onDelete,
}: TaskRowProps): ReactElement => (
  <li className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
    <Checkbox
      checked={task.status === "done"}
      onCheckedChange={() => onToggle(task.entityId)}
      aria-label={task.title}
    />
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <span
        className={cn(
          "truncate text-sm font-medium",
          task.status === "done" && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </span>
      {task.notes === null ? null : <NotesMarker />}
    </span>
    <DueDate task={task} today={today} />
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Delete task"
      className="opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
      onClick={() => onDelete(task.entityId)}
    >
      <X aria-hidden="true" />
    </Button>
  </li>
);
