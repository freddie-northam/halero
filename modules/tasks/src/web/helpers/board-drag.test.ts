import { describe, expect, test } from "bun:test";
import type { Task } from "../../contract";
import {
  type BoardColumns,
  type ComputedMove,
  columnDroppableId,
  computeDragMove,
  createDragEndHandler,
  sortOrderBetween,
} from "./board-drag";

const task = (seed: Partial<Task> & { entityId: string }): Task => ({
  title: "Untitled",
  status: "todo",
  priority: null,
  tags: [],
  dueDate: null,
  notes: null,
  estimateMinutes: null,
  loggedMinutes: 0,
  sortOrder: 1,
  completedAt: null,
  ...seed,
});

describe("sortOrderBetween", () => {
  test("lands on the midpoint between two neighbors", () => {
    expect(sortOrderBetween(2, 4)).toBe(3);
  });

  test("halves the sole remaining sibling at the start of a column", () => {
    expect(sortOrderBetween(null, 4)).toBe(2);
  });

  test("lands one past the last sibling at the end of a column", () => {
    expect(sortOrderBetween(5, null)).toBe(6);
  });

  test("starts at 1 in an empty column", () => {
    expect(sortOrderBetween(null, null)).toBe(1);
  });

  test("keeps bisecting fractional neighbors without colliding", () => {
    expect(sortOrderBetween(1.5, 2)).toBe(1.75);
  });
});

describe("columnDroppableId", () => {
  test("prefixes the status so it never collides with a card's entityId", () => {
    expect(columnDroppableId("todo")).toBe("column:todo");
    expect(columnDroppableId("doing")).toBe("column:doing");
    expect(columnDroppableId("done")).toBe("column:done");
  });
});

describe("computeDragMove", () => {
  const columns = {
    todo: [
      task({ entityId: "t-1", status: "todo", sortOrder: 1 }),
      task({ entityId: "t-2", status: "todo", sortOrder: 2 }),
      task({ entityId: "t-3", status: "todo", sortOrder: 3 }),
    ],
    doing: [task({ entityId: "d-1", status: "doing", sortOrder: 1 })],
    done: [],
  };

  test("dropping on a card in another column inserts before it, between its neighbors", () => {
    const move = computeDragMove(columns, "t-2", "d-1");

    expect(move).toEqual({ entityId: "t-2", status: "doing", sortOrder: 0.5 });
  });

  test("dropping on a column's empty area appends past its last card", () => {
    const move = computeDragMove(columns, "t-1", columnDroppableId("doing"));

    expect(move).toEqual({ entityId: "t-1", status: "doing", sortOrder: 2 });
  });

  test("dropping on the empty done column starts it at 1", () => {
    const move = computeDragMove(columns, "t-1", columnDroppableId("done"));

    expect(move).toEqual({ entityId: "t-1", status: "done", sortOrder: 1 });
  });

  test("reordering within the same column excludes the dragged card from its own neighbors", () => {
    const move = computeDragMove(columns, "t-1", "t-3");

    // t-1 is removed first, leaving [t-2(2), t-3(3)]; dropping on t-3
    // lands between t-2 and t-3.
    expect(move).toEqual({ entityId: "t-1", status: "todo", sortOrder: 2.5 });
  });

  test("dropping past the last card in the same column lands after it", () => {
    const move = computeDragMove(columns, "t-1", columnDroppableId("todo"));

    expect(move).toEqual({ entityId: "t-1", status: "todo", sortOrder: 4 });
  });

  test("returns null for an unknown dragged card", () => {
    expect(computeDragMove(columns, "missing", "t-1")).toBeNull();
  });

  test("returns null when the drop target resolves to no column", () => {
    expect(computeDragMove(columns, "t-1", "missing")).toBeNull();
  });
});

describe("createDragEndHandler", () => {
  const columns: BoardColumns = {
    todo: [
      task({ entityId: "t-1", status: "todo", sortOrder: 1 }),
      task({ entityId: "t-2", status: "todo", sortOrder: 2 }),
    ],
    doing: [],
    done: [],
  };

  test("calls onMove with the resolved move for a known active/over pair", () => {
    const moves: ComputedMove[] = [];
    const handler = createDragEndHandler(
      () => columns,
      (move) => moves.push(move),
    );

    handler({
      active: { id: "t-1" },
      over: { id: columnDroppableId("doing") },
    });

    expect(moves).toEqual([{ entityId: "t-1", status: "doing", sortOrder: 1 }]);
  });

  test("does nothing when dropped outside any droppable", () => {
    const moves: ComputedMove[] = [];
    const handler = createDragEndHandler(
      () => columns,
      (move) => moves.push(move),
    );

    handler({ active: { id: "t-1" }, over: null });

    expect(moves).toEqual([]);
  });

  test("does nothing when the drop resolves to no column", () => {
    const moves: ComputedMove[] = [];
    const handler = createDragEndHandler(
      () => columns,
      (move) => moves.push(move),
    );

    handler({ active: { id: "t-1" }, over: { id: "unknown" } });

    expect(moves).toEqual([]);
  });

  test("reads the columns fresh on every call, not just at creation", () => {
    let columnsSnapshot = columns;
    const moves: ComputedMove[] = [];
    const handler = createDragEndHandler(
      () => columnsSnapshot,
      (move) => moves.push(move),
    );
    columnsSnapshot = {
      ...columns,
      doing: [task({ entityId: "d-1", status: "doing", sortOrder: 5 })],
    };

    handler({ active: { id: "t-1" }, over: { id: "d-1" } });

    expect(moves).toEqual([
      { entityId: "t-1", status: "doing", sortOrder: 2.5 },
    ]);
  });
});
