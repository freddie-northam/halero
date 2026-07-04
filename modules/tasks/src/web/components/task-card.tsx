// One board card: a colored top accent from its first tag, title, tag
// chips, a priority chip, a due date (tinted from the server's today,
// never the client clock), a notes snippet, and a time footer once
// Task 5 fills in estimate/logged minutes. The whole surface is a
// dnd-kit sortable item; the click-to-open and drag-to-move gestures
// coexist through the sensor's activation distance (see BoardView), not
// through anything this component does. Since the card's Space/Enter are
// claimed by the dnd keyboard sensor, the EditTaskButton is the
// keyboard/SR path to the detail sheet. A subtle border/bg hover signals
// the card is interactive, on top of the EditTaskButton's own
// reveal-on-hover/focus.

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, cn } from "@halero/ui";
import type { CSSProperties, ReactElement } from "react";
import type { Task } from "../../contract";
import {
  priorityBadgeClass,
  priorityLabel,
  tagAccentClass,
  tagBadgeClass,
} from "../helpers/board-style";
import { formatDueDate, isDueOrOverdue } from "../helpers/due-date";
import { formatMinutes } from "../helpers/format-minutes";
import { EditTaskButton } from "./edit-task-button";

export interface TaskCardProps {
  readonly task: Task;
  /** The server-computed today (home timezone), for the overdue tint. */
  readonly today: string;
  readonly onOpen: () => void;
}

/**
 * "Est 3h · Logged 2h 50m": both halves show when present, either alone
 * when only one is set, and nothing when neither is. Logged time past
 * the estimate gets a light warning tint, not a hard error color.
 */
const TimeFooter = ({ task }: { readonly task: Task }): ReactElement | null => {
  const { estimateMinutes, loggedMinutes } = task;
  if (estimateMinutes === null && loggedMinutes === 0) {
    return null;
  }
  const overEstimate =
    estimateMinutes !== null && loggedMinutes > estimateMinutes;
  const loggedText = `Logged ${formatMinutes(loggedMinutes)}`;
  return (
    <span className="tnum">
      {estimateMinutes === null
        ? null
        : `Est ${formatMinutes(estimateMinutes)}`}
      {estimateMinutes !== null && loggedMinutes > 0 ? " · " : null}
      {loggedMinutes === 0 ? null : overEstimate ? (
        <span className="text-amber-600 dark:text-amber-500">{loggedText}</span>
      ) : (
        loggedText
      )}
    </span>
  );
};

const CardBody = ({
  task,
  today,
  onOpen,
}: {
  readonly task: Task;
  readonly today: string;
  readonly onOpen: () => void;
}): ReactElement => {
  const overdue = task.status !== "done" && isDueOrOverdue(task.dueDate, today);
  return (
    <div className="flex flex-col gap-1.5 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{task.title}</p>
        <EditTaskButton
          title={task.title}
          onOpen={onOpen}
          className="shrink-0 opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
        />
      </div>
      {task.tags.length === 0 ? null : (
        <div className="flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <Badge key={tag} variant="outline" className={tagBadgeClass(tag)}>
              {tag}
            </Badge>
          ))}
        </div>
      )}
      {task.priority === null ? null : (
        <Badge
          variant="outline"
          className={cn("w-fit", priorityBadgeClass(task.priority))}
        >
          {priorityLabel(task.priority)}
        </Badge>
      )}
      {task.notes === null || task.notes.trim() === "" ? null : (
        <p className="truncate text-xs text-muted-foreground">{task.notes}</p>
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {task.dueDate === null ? (
          <span />
        ) : (
          <span className={cn("tnum", overdue && "text-destructive")}>
            {formatDueDate(task.dueDate, today)}
          </span>
        )}
        <TimeFooter task={task} />
      </div>
    </div>
  );
};

export const TaskCard = ({
  task,
  today,
  onOpen,
}: TaskCardProps): ReactElement => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.entityId });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const accent = tagAccentClass(task.tags[0] ?? null);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dnd-kit's useSortable spreads role="button" onto this node via {...attributes}.
    // biome-ignore lint/a11y/useKeyWithClickEvents: {...listeners} already binds the Space/Enter keydown dnd-kit uses to pick the card up.
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cn(
        "group cursor-pointer overflow-hidden rounded-md border bg-card transition-colors hover:border-foreground/15 hover:bg-muted/50",
        isDragging && "opacity-50",
      )}
    >
      {accent === null ? null : <div className={cn("h-1", accent)} />}
      <CardBody task={task} today={today} onOpen={onOpen} />
    </div>
  );
};
