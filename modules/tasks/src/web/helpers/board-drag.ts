// The board drag's pure math: turning a dnd-kit drop (an active card, an
// over target) into move()'s payload. Kept free of dnd-kit and React so
// the sortOrder midpoint logic is unit-testable without a DOM.

import type { Task, TaskStatus } from "../../contract";

export interface BoardColumns {
  readonly todo: readonly Task[];
  readonly doing: readonly Task[];
  readonly done: readonly Task[];
}

const STATUSES: readonly TaskStatus[] = ["todo", "doing", "done"];

/** A column's own droppable id, distinct from any card's entityId. */
const COLUMN_DROPPABLE_PREFIX = "column:";

export const columnDroppableId = (status: TaskStatus): string =>
  `${COLUMN_DROPPABLE_PREFIX}${status}`;

const isTaskStatus = (value: string): value is TaskStatus =>
  (STATUSES as readonly string[]).includes(value);

const statusFromDroppableId = (id: string): TaskStatus | null => {
  if (!id.startsWith(COLUMN_DROPPABLE_PREFIX)) {
    return null;
  }
  const status = id.slice(COLUMN_DROPPABLE_PREFIX.length);
  return isTaskStatus(status) ? status : null;
};

/**
 * The fractional sort_order between two neighbors: their midpoint, half
 * the sole sibling at the start of a column, one past the last sibling
 * at the end, or 1 to start an empty column. Every case stays strictly
 * between its neighbors, so repeated drops to the same spot never
 * collide with an existing row.
 *
 * Known limitation: repeatedly bisecting the same gap halves the
 * available float precision each time, so after ~50 drops into one spot
 * two neighbors could round to the same double. Server-side sort_order
 * renormalization would fix that permanently and is out of scope here;
 * in practice a column is never reordered that many times between the
 * periodic re-seeds the board already does on create/move.
 */
export const sortOrderBetween = (
  before: number | null,
  after: number | null,
): number => {
  if (before === null && after === null) {
    return 1;
  }
  if (before === null) {
    return (after as number) / 2;
  }
  if (after === null) {
    return before + 1;
  }
  return (before + after) / 2;
};

const findTask = (columns: BoardColumns, entityId: string): Task | null => {
  for (const status of STATUSES) {
    const found = columns[status].find((item) => item.entityId === entityId);
    if (found !== undefined) {
      return found;
    }
  }
  return null;
};

export interface ComputedMove {
  readonly entityId: string;
  readonly status: TaskStatus;
  readonly sortOrder: number;
}

/**
 * Resolves a drag-end (active card id, over target id) into the move()
 * call: the target column and a sort order between whatever cards
 * border the drop point. Dropping on a column's own droppable area (its
 * empty space, past the last card) appends to the end; dropping on
 * another card inserts just before it. The dragged card is excluded
 * from its own neighbor search, so reordering within a column works the
 * same way as crossing into another one.
 *
 * Returns null (a no-op, no api.move) when the drop does not actually
 * change anything: dropped back onto its own card (dnd-kit's classic
 * over.id === active.id when the pointer never left the slot), or landed
 * in the same column at the same position it started in.
 */
export const computeDragMove = (
  columns: BoardColumns,
  activeId: string,
  overId: string,
): ComputedMove | null => {
  // Self-drop guard: over.id === active.id means the card never moved.
  // It has to be caught here explicitly, not by the position check below,
  // because filtering the active card out of its own siblings makes the
  // over card unfindable and the drop falls through to an append.
  if (activeId === overId) {
    return null;
  }
  const active = findTask(columns, activeId);
  if (active === null) {
    return null;
  }
  const overColumnStatus = statusFromDroppableId(overId);
  const overTask = overColumnStatus === null ? findTask(columns, overId) : null;
  const targetStatus = overColumnStatus ?? overTask?.status ?? null;
  if (targetStatus === null) {
    return null;
  }
  const siblings = columns[targetStatus].filter(
    (item) => item.entityId !== activeId,
  );
  const overIndex =
    overTask === null
      ? -1
      : siblings.findIndex((item) => item.entityId === overTask.entityId);
  const index = overIndex === -1 ? siblings.length : overIndex;
  // Same-position guard: inserting the card at siblings-index `index`
  // puts it at full-column position `index`; if that equals where it
  // already sits in its own column, nothing changed, so skip the move.
  if (targetStatus === active.status) {
    const originalIndex = columns[active.status].findIndex(
      (item) => item.entityId === activeId,
    );
    if (index === originalIndex) {
      return null;
    }
  }
  const before = index > 0 ? (siblings[index - 1]?.sortOrder ?? null) : null;
  const after =
    index < siblings.length ? (siblings[index]?.sortOrder ?? null) : null;
  return {
    entityId: activeId,
    status: targetStatus,
    sortOrder: sortOrderBetween(before, after),
  };
};

/**
 * The minimal shape a drag-end handler needs from dnd-kit's DragEndEvent:
 * kept independent of the library's own types so this file never has to
 * import dnd-kit, and any real DragEndEvent satisfies it structurally.
 */
export interface DragEndLike {
  readonly active: { readonly id: string | number };
  readonly over: { readonly id: string | number } | null;
}

/**
 * Builds the onDragEnd handler BoardView wires into DndContext. Columns
 * are read fresh on every call (through the getter) rather than closed
 * over once, so a handler built at mount time still sees the latest
 * board data on each drop.
 */
export const createDragEndHandler =
  (getColumns: () => BoardColumns, onMove: (move: ComputedMove) => void) =>
  (event: DragEndLike): void => {
    if (event.over === null) {
      return;
    }
    const move = computeDragMove(
      getColumns(),
      String(event.active.id),
      String(event.over.id),
    );
    if (move !== null) {
      onMove(move);
    }
  };
