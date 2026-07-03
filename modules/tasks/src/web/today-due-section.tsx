// The tasks module's block for the Today page: open tasks due today or
// overdue, straight from the module's today() procedure. Rows toggle
// with the same checkbox as the page; the host-wired invalidation
// refreshes this section and the page from one cache.

import { Alert, AlertDescription, Checkbox, Loader2 } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  type ComponentType,
  type ReactElement,
  type ReactNode,
  useState,
} from "react";
import type { Task } from "../contract";
import type { TasksApi } from "./api";
import { formatDueDate } from "./helpers/due-date";
import { tasksTodayKey } from "./queries";
import { readableError } from "./readable-error";

/**
 * Module pages mount into the host's route tree dynamically, so the
 * host's literal route types cannot know /tasks at compile time; the
 * narrow structural cast keeps the link typed on the module side (the
 * calendar module's section does the same).
 */
const TasksLink = Link as unknown as ComponentType<{
  readonly to: "/tasks";
  readonly className?: string;
  readonly children: ReactNode;
}>;

const DueRow = ({
  task,
  today,
  onToggle,
}: {
  readonly task: Task;
  readonly today: string;
  readonly onToggle: (entityId: string) => void;
}): ReactElement => (
  <li className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
    <Checkbox
      checked={false}
      onCheckedChange={() => onToggle(task.entityId)}
      aria-label={task.title}
    />
    <span className="min-w-0 flex-1 truncate text-sm font-medium">
      {task.title}
    </span>
    {task.dueDate !== null && task.dueDate < today ? (
      // Only truly overdue rows carry their date: the slip is the news.
      <span className="tnum shrink-0 text-xs text-destructive">
        {formatDueDate(task.dueDate, today)}
      </span>
    ) : null}
  </li>
);

const SectionBody = ({
  tasks,
  today,
  onToggle,
}: {
  readonly tasks: readonly Task[];
  readonly today: string;
  readonly onToggle: (entityId: string) => void;
}): ReactElement => {
  if (tasks.length === 0) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">Nothing due today.</p>
    );
  }
  return (
    <ul className="mt-2 flex flex-col gap-0.5">
      {tasks.map((task) => (
        <DueRow
          key={task.entityId}
          task={task}
          today={today}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
};

const SectionHeading = (): ReactElement => (
  <div className="flex items-baseline justify-between">
    <h2 className="text-sm font-semibold tracking-tight">Due today</h2>
    <TasksLink
      to="/tasks"
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      View all tasks
    </TasksLink>
  </div>
);

/** Builds the Today-page section around the host-wired tasks queries. */
export const createTasksTodaySection = (api: TasksApi) => {
  const TasksTodaySection = (): ReactElement => {
    const [actionError, setActionError] = useState<string | null>(null);
    const todayQuery = useQuery({
      queryKey: tasksTodayKey,
      queryFn: () => api.today(),
    });

    const toggle = async (entityId: string): Promise<void> => {
      setActionError(null);
      try {
        await api.toggle(entityId);
      } catch (error) {
        setActionError(readableError(error));
      }
    };

    const body = (): ReactElement => {
      const message =
        actionError ??
        (todayQuery.error === null ? null : readableError(todayQuery.error));
      if (message !== null) {
        return (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        );
      }
      const data = todayQuery.data;
      if (data === undefined) {
        return (
          <Loader2
            aria-hidden="true"
            className="mt-2 size-4 animate-spin text-muted-foreground"
          />
        );
      }
      return (
        <SectionBody
          tasks={data.tasks}
          today={data.today}
          onToggle={(entityId) => void toggle(entityId)}
        />
      );
    };

    return (
      <section aria-label="Due today">
        <SectionHeading />
        {body()}
      </section>
    );
  };
  return TasksTodaySection;
};
