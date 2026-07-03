// One board card: a colored top accent from its first tag, title, tag
// chips, a priority chip, a due date (tinted from the server's today,
// never the client clock), a notes snippet, and a time footer once
// Task 5 fills in estimate/logged minutes. The whole surface is a
// dnd-kit sortable item; the click-to-open and drag-to-move gestures
// coexist through the sensor's activation distance (see BoardView), not
// through anything this component does.

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

export interface TaskCardProps {
  readonly task: Task;
  /** The server-computed today (home timezone), for the overdue tint. */
  readonly today: string;
  readonly onOpen: () => void;
}

const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) {
    return `${mins}m`;
  }
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
};

const TimeFooter = ({ task }: { readonly task: Task }): ReactElement | null => {
  if (task.loggedMinutes > 0) {
    return <span>{`Logged ${formatMinutes(task.loggedMinutes)}`}</span>;
  }
  if (task.estimateMinutes !== null) {
    return <span>{`Est ${formatMinutes(task.estimateMinutes)}`}</span>;
  }
  return null;
};

const CardBody = ({
  task,
  today,
}: {
  readonly task: Task;
  readonly today: string;
}): ReactElement => {
  const overdue = task.status !== "done" && isDueOrOverdue(task.dueDate, today);
  return (
    <div className="flex flex-col gap-1.5 p-2.5">
      <p className="text-sm font-medium">{task.title}</p>
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
        "cursor-pointer overflow-hidden rounded-md border bg-card",
        isDragging && "opacity-50",
      )}
    >
      {accent === null ? null : <div className={cn("h-1", accent)} />}
      <CardBody task={task} today={today} />
    </div>
  );
};
