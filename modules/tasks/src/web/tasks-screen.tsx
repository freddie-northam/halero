// The tasks page: a Board/List switcher (URL-driven, board default) over
// either the Kanban board or the due-date triage list, plus a detail
// dialog for editing a card. Data arrives through the narrow TasksApi
// seam the host registry wires (and wraps with cache invalidation); the
// overdue tint and the board's "today" always compare against the
// server-computed date, so the client does no timezone math anywhere.

import { Alert, AlertDescription, Loader2 } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import type { Task } from "../contract";
import type { TasksApi } from "./api";
import { TaskDetailDialog } from "./components/task-detail-dialog";
import { TasksViewSwitcher } from "./components/view-switcher";
import {
  normalizeTasksSearch,
  type TasksSearch,
  type TasksView,
} from "./helpers/board-search";
import { tasksBoardKey } from "./queries";
import { readableError } from "./readable-error";
import { BoardView } from "./views/board-view";
import { ListView } from "./views/list-view";

/**
 * Module pages mount into the host's route tree dynamically, so the
 * host's literal route types cannot know /tasks at compile time; the
 * narrow structural signature keeps navigation typed on the module side
 * (the calendar screen's pattern).
 */
type TasksNavigate = (options: {
  readonly to: "/tasks";
  readonly search: TasksSearch;
}) => Promise<void>;

const BoardBody = ({
  api,
  onOpenTask,
}: {
  readonly api: TasksApi;
  readonly onOpenTask: (task: Task) => void;
}): ReactElement => {
  const boardQuery = useQuery({
    queryKey: tasksBoardKey,
    queryFn: () => api.board(),
  });
  if (boardQuery.error !== null) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertDescription>{readableError(boardQuery.error)}</AlertDescription>
      </Alert>
    );
  }
  const board = boardQuery.data;
  if (board === undefined) {
    return (
      <Loader2
        aria-hidden="true"
        className="mt-4 size-4 animate-spin text-muted-foreground"
      />
    );
  }
  return (
    <BoardView
      board={board}
      onMove={(move) => void api.move(move)}
      onCreate={async (input) => void (await api.create(input))}
      onOpenTask={onOpenTask}
    />
  );
};

/** Builds the page component around the host-wired tasks queries. */
export const createTasksScreen = (api: TasksApi) => {
  const TasksScreen = (): ReactElement => {
    const rawSearch: unknown = useSearch({ strict: false });
    const { view } = normalizeTasksSearch(rawSearch);
    const navigate = useNavigate() as unknown as TasksNavigate;
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);

    const setView = (next: TasksView): void => {
      void navigate({ to: "/tasks", search: { view: next } });
    };

    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
          <TasksViewSwitcher view={view} onViewChange={setView} />
        </div>
        <div className="mt-4">
          {view === "list" ? (
            <ListView api={api} onOpenTask={setSelectedTask} />
          ) : (
            <BoardBody api={api} onOpenTask={setSelectedTask} />
          )}
        </div>
        <TaskDetailDialog
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSave={async (input) => {
            await api.update(input);
            setSelectedTask(null);
          }}
          onDelete={async (entityId) => {
            await api.delete(entityId);
            setSelectedTask(null);
          }}
          onLogTime={async (entityId, minutes) => {
            // Keeps the dialog open, unlike save/delete: logging time is a
            // running total, not a one-shot edit that closes the editor.
            setSelectedTask(await api.logTime({ entityId, minutes }));
          }}
        />
      </div>
    );
  };
  return TasksScreen;
};
