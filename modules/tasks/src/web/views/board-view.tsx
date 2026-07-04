// The Kanban board: three columns backed by api.board(), draggable via
// dnd-kit. A click opens the detail sheet; a drag past the pointer
// sensor's activation distance moves the card instead, so the two
// gestures never fight over the same pointer-down.
//
// The row is a flex row (stacked on narrow screens) with items-start:
// each column caps and scrolls its own height (see board-column.tsx),
// and items-start keeps a short column from being stretched to a tall
// sibling's height, which is what used to turn an empty column into a
// dead box.

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { ReactElement } from "react";
import type { Task, TaskBoard, TaskStatus } from "../../contract";
import { BoardColumn } from "../components/board-column";
import { type ComputedMove, createDragEndHandler } from "../helpers/board-drag";

export interface BoardViewProps {
  readonly board: TaskBoard;
  readonly onMove: (move: ComputedMove) => void;
  /** Creates a task directly into the given column's status. */
  readonly onCreate: (status: TaskStatus, title: string) => Promise<void>;
  readonly onOpenTask: (task: Task) => void;
}

const COLUMNS: readonly {
  readonly status: TaskStatus;
  readonly label: string;
}[] = [
  { status: "todo", label: "To do" },
  { status: "doing", label: "Doing" },
  { status: "done", label: "Done" },
];

/** A click starts no drag until the pointer moves this far, so a plain
 * click on a card reaches its onClick untouched. */
const ACTIVATION_DISTANCE = 8;

export const BoardView = ({
  board,
  onMove,
  onCreate,
  onOpenTask,
}: BoardViewProps): ReactElement => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: ACTIVATION_DISTANCE },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = createDragEndHandler(() => board.columns, onMove);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {COLUMNS.map(({ status, label }) => (
          <BoardColumn
            key={status}
            status={status}
            label={label}
            tasks={board.columns[status]}
            today={board.today}
            onOpenTask={onOpenTask}
            onCreate={(title) => onCreate(status, title)}
          />
        ))}
      </div>
    </DndContext>
  );
};
