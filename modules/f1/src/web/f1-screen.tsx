// The F1 page: a set of user-arranged widget boards. Boards are Tabs; an
// Edit toggle turns on drag-to-reorder, resize, remove, and the add-widget
// menu, plus rename and delete for the current board. Every layout change
// (reorder, add, remove, resize) persists through api.boards.saveLayout,
// which the host wraps to invalidate the board list. Data arrives through
// the narrow F1Api seam the registry wires; this file does no transport
// and no timezone math.

import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Loader2,
  PageHeader,
  Switcher,
} from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import { type ComponentType, type ReactElement, useState } from "react";
import type { Board, WidgetInstance } from "../contract";
import type { F1Api } from "./api";
import { AddWidget } from "./board/add-widget";
import { BoardGrid } from "./board/board-grid";
import { BoardNameDialog } from "./board/board-name-dialog";
import { f1BoardsKey } from "./queries";
import { readableError } from "./readable-error";
import type { WidgetDef } from "./widgets/registry";

/**
 * One board's widgets plus its edit affordances. It keeps a working copy
 * of the layout so a drag or resize shows instantly, persisting each
 * change in the background; the parent remounts it (via key) when the
 * selected board changes, so the working copy always starts from that
 * board's saved layout.
 */
const BoardEditor = ({
  board,
  api,
  editing,
}: {
  readonly board: Board;
  readonly api: F1Api;
  readonly editing: boolean;
}): ReactElement => {
  const [layout, setLayout] = useState<readonly WidgetInstance[]>(board.layout);

  const existingTypes = new Set(layout.map((instance) => instance.type));

  const persist = (next: readonly WidgetInstance[]): void => {
    setLayout(next);
    void api.boards.saveLayout({ id: board.id, layout: next });
  };
  const addWidget = (def: WidgetDef): void => {
    // One of each widget type per board: adding is idempotent, and the menu
    // already shows added types as disabled.
    if (existingTypes.has(def.type)) {
      return;
    }
    persist([
      ...layout,
      {
        instanceId: crypto.randomUUID(),
        type: def.type,
        size: def.defaultSize,
        config: {},
      },
    ]);
  };

  return (
    <div className="mt-4 flex flex-col gap-4">
      {editing ? (
        <div className="flex justify-end">
          <AddWidget onAdd={addWidget} existingTypes={existingTypes} />
        </div>
      ) : null}
      {layout.length === 0 ? (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {editing
            ? "Add a widget to get started."
            : "This board is empty. Turn on Edit to add widgets."}
        </p>
      ) : (
        <BoardGrid
          layout={layout}
          api={api}
          editing={editing}
          onLayoutChange={persist}
        />
      )}
    </div>
  );
};

/** Confirms a destructive board delete before it happens. */
const DeleteBoardDialog = ({
  board,
  onConfirm,
}: {
  readonly board: Board;
  readonly onConfirm: () => Promise<void>;
}): ReactElement => {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const confirm = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (thrown) {
      setError(readableError(thrown));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete "{board.name}"?</DialogTitle>
          <DialogDescription>
            This removes the board and its widget layout. It cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error === null ? null : (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={saving}
            onClick={() => void confirm()}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** The first-run prompt when no board exists yet. */
const NoBoards = ({
  onCreate,
}: {
  readonly onCreate: (name: string) => Promise<void>;
}): ReactElement => (
  <div className="mt-10 flex flex-col items-center gap-3 text-center">
    <p className="text-sm text-muted-foreground">
      No boards yet. Create one to arrange your F1 widgets.
    </p>
    <BoardNameDialog
      title="New board"
      submitLabel="Create"
      onSubmit={onCreate}
      trigger={
        <Button type="button" size="sm">
          New board
        </Button>
      }
    />
  </div>
);

/** Builds the page component around the host-wired F1 board queries. */
export const createF1Screen = (api: F1Api): ComponentType => {
  const F1Screen = (): ReactElement => {
    const boardsQuery = useQuery({
      queryKey: f1BoardsKey,
      queryFn: () => api.boards.list(),
    });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);

    if (boardsQuery.error !== null) {
      return (
        <Alert variant="destructive">
          <AlertDescription>
            {readableError(boardsQuery.error)}
          </AlertDescription>
        </Alert>
      );
    }
    const boards = boardsQuery.data;
    if (boards === undefined) {
      return (
        <Loader2
          aria-hidden="true"
          className="size-4 animate-spin text-muted-foreground"
        />
      );
    }

    const createBoard = async (name: string): Promise<void> => {
      const board = await api.boards.create({ name });
      setSelectedId(board.id);
      setEditing(true);
    };

    const selected =
      boards.find((board) => board.id === selectedId) ?? boards[0] ?? null;

    return (
      <>
        <PageHeader title="Formula 1">
          {selected === null ? null : (
            <>
              {editing ? (
                <>
                  <BoardNameDialog
                    title="Rename board"
                    submitLabel="Save"
                    initialName={selected.name}
                    onSubmit={async (name) => {
                      await api.boards.rename({ id: selected.id, name });
                    }}
                    trigger={
                      <Button type="button" size="sm" variant="ghost">
                        Rename
                      </Button>
                    }
                  />
                  <DeleteBoardDialog
                    board={selected}
                    onConfirm={async () => {
                      await api.boards.remove({ id: selected.id });
                      setSelectedId(null);
                    }}
                  />
                  <BoardNameDialog
                    title="New board"
                    submitLabel="Create"
                    onSubmit={createBoard}
                    trigger={
                      <Button type="button" size="sm" variant="ghost">
                        New board
                      </Button>
                    }
                  />
                </>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant={editing ? "default" : "outline"}
                onClick={() => setEditing((value) => !value)}
              >
                {editing ? "Done" : "Edit"}
              </Button>
            </>
          )}
        </PageHeader>

        {selected === null ? (
          <NoBoards onCreate={createBoard} />
        ) : (
          <>
            <div className="mt-6">
              <Switcher
                ariaLabel="Boards"
                value={selected.id}
                onValueChange={setSelectedId}
                options={boards.map((board) => ({
                  value: board.id,
                  label: board.name,
                }))}
              />
            </div>
            <BoardEditor
              key={selected.id}
              board={selected}
              api={api}
              editing={editing}
            />
          </>
        )}
      </>
    );
  };
  return F1Screen;
};
