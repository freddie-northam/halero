// The due-date triage list: quick capture, Open/Done/All filter tabs,
// and a dense row list ordered by due date (the board handles manual
// ordering; this view is unchanged from v0.2 beyond the rename to a
// dedicated view file).

import {
  Alert,
  AlertDescription,
  Loader2,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import type { Task, TaskFilter } from "../../contract";
import type { TasksApi } from "../api";
import { QuickAddForm } from "../components/quick-add-form";
import { TaskRow } from "../components/task-row";
import { tasksListKey, tasksTodayKey } from "../queries";
import { readableError } from "../readable-error";

export interface ListViewProps {
  readonly api: TasksApi;
  /** Opens the shared detail sheet, the only editor for a task. */
  readonly onOpenTask: (task: Task) => void;
}

const EMPTY_LINES: Record<TaskFilter, string> = {
  todo: "No open tasks.",
  done: "No completed tasks.",
  all: "No tasks yet.",
};

const isTaskFilter = (value: string): value is TaskFilter =>
  value === "todo" || value === "done" || value === "all";

const FilterTabs = ({
  filter,
  onFilterChange,
}: {
  readonly filter: TaskFilter;
  readonly onFilterChange: (filter: TaskFilter) => void;
}): ReactElement => (
  <Tabs
    value={filter}
    onValueChange={(value) => {
      if (isTaskFilter(value)) {
        onFilterChange(value);
      }
    }}
  >
    <TabsList aria-label="Task filter">
      <TabsTrigger value="todo">Open</TabsTrigger>
      <TabsTrigger value="done">Done</TabsTrigger>
      <TabsTrigger value="all">All</TabsTrigger>
    </TabsList>
  </Tabs>
);

const TaskListBody = ({
  tasks,
  filter,
  today,
  onToggle,
  onOpen,
  onDelete,
}: {
  readonly tasks: readonly Task[];
  readonly filter: TaskFilter;
  readonly today: string;
  readonly onToggle: (entityId: string) => void;
  readonly onOpen: (task: Task) => void;
  readonly onDelete: (entityId: string) => void;
}): ReactElement => {
  if (tasks.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        {EMPTY_LINES[filter]}
      </p>
    );
  }
  return (
    <ul className="mt-3 flex flex-col gap-0.5">
      {tasks.map((task) => (
        <TaskRow
          key={task.entityId}
          task={task}
          today={today}
          onToggle={onToggle}
          onOpen={onOpen}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
};

export const ListView = ({ api, onOpenTask }: ListViewProps): ReactElement => {
  const [filter, setFilter] = useState<TaskFilter>("todo");
  const [actionError, setActionError] = useState<string | null>(null);
  // The today anchor is the module's own cheap procedure; its `today`
  // value is the only date the overdue comparison ever uses.
  const todayQuery = useQuery({
    queryKey: tasksTodayKey,
    queryFn: () => api.today(),
  });
  const listQuery = useQuery({
    queryKey: tasksListKey(filter),
    queryFn: () => api.list(filter),
  });

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(readableError(error));
    }
  };

  const body = (): ReactElement => {
    const error = todayQuery.error ?? listQuery.error;
    if (error !== null) {
      return (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{readableError(error)}</AlertDescription>
        </Alert>
      );
    }
    const today = todayQuery.data?.today;
    const list = listQuery.data;
    if (today === undefined || list === undefined) {
      return (
        <Loader2
          aria-hidden="true"
          className="mt-4 size-4 animate-spin text-muted-foreground"
        />
      );
    }
    return (
      <TaskListBody
        tasks={list.tasks}
        filter={filter}
        today={today}
        onToggle={(entityId) => void run(() => api.toggle(entityId))}
        onOpen={onOpenTask}
        onDelete={(entityId) => void run(() => api.delete(entityId))}
      />
    );
  };

  return (
    <div>
      <QuickAddForm
        onCreate={async (input) => void (await api.create(input))}
      />
      <div className="mt-4">
        <FilterTabs filter={filter} onFilterChange={setFilter} />
      </div>
      {actionError === null ? null : (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}
      {body()}
    </div>
  );
};
