// One board column: a header (label + count), its cards inside a
// dnd-kit sortable list, and a compact "+ Add task" row at the bottom
// that creates directly into this column's status. The column's own
// droppable id lets a drop land past the last card, or into an empty
// column, even when it isn't over any card.
//
// The column caps its own height to the viewport (sm and up, where the
// board's three columns sit in a row) and lets its card list scroll
// internally past that cap; align-items: start on the row (see
// board-view.tsx) keeps a short column from being stretched to match a
// tall sibling, so an empty column stays compact instead of becoming a
// dead box.

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
      className="flex min-w-0 flex-col rounded-lg border bg-muted/60 p-2 sm:flex-1 sm:max-h-[calc(100dvh-11rem)]"
    >
      <div className="flex shrink-0 items-center justify-between px-1 py-1">
        <h2 id={headingId} className="text-sm font-semibold tracking-tight">
          {label}
        </h2>
        <Badge variant="secondary">{tasks.length}</Badge>
      </div>
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className="mt-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
        >
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
      <div className="mt-1 shrink-0 px-1">
        <AddTaskRow onCreate={onCreate} />
      </div>
    </section>
  );
};
