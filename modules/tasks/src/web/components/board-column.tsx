// One board column: a header (label + count), its cards inside a
// dnd-kit sortable list, and a compact "+ Add task" row at the bottom
// that creates directly into this column's status. The column's own
// droppable id lets a drop land past the last card, or into an empty
// column, even when it isn't over any card.

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Badge } from "@halero/ui";
import type { ReactElement } from "react";
import type { Task, TaskStatus } from "../../contract";
import { columnDroppableId } from "../helpers/board-drag";
import { AddTaskRow } from "./add-task-row";
import { TaskCard } from "./task-card";

export interface BoardColumnProps {
  readonly status: TaskStatus;
  readonly label: string;
  readonly tasks: readonly Task[];
  readonly today: string;
  readonly onOpenTask: (task: Task) => void;
  readonly onCreate: (title: string) => Promise<void>;
}

export const BoardColumn = ({
  status,
  label,
  tasks,
  today,
  onOpenTask,
  onCreate,
}: BoardColumnProps): ReactElement => {
  const { setNodeRef } = useDroppable({ id: columnDroppableId(status) });
  const cardIds = tasks.map((task) => task.entityId);
  const headingId = `${status}-column-heading`;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col rounded-lg border bg-muted/20 p-2"
    >
      <div className="flex items-center justify-between px-1 py-1">
        <h2 id={headingId} className="text-sm font-semibold tracking-tight">
          {label}
        </h2>
        <Badge variant="secondary">{tasks.length}</Badge>
      </div>
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="mt-1 flex min-h-16 flex-col gap-2">
          {tasks.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">
              Nothing here.
            </p>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.entityId}
                task={task}
                today={today}
                onOpen={() => onOpenTask(task)}
              />
            ))
          )}
        </div>
      </SortableContext>
      <div className="mt-1 px-1">
        <AddTaskRow onCreate={onCreate} />
      </div>
    </section>
  );
};
