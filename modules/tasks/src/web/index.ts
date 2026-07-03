// The tasks module's web entry: nav, page, Today section, and entity
// link contributions. The host registry supplies the TasksApi (backed by
// modules.tasks.* on its tRPC client) already wrapped with the module's
// invalidation helper; everything else is self-contained module code
// composing @halero/ui. No @halero/db import belongs here, ever.

import { defineWebModule, type WebModule } from "@halero/module-sdk/web";
import { TASK_ITEM_KIND } from "@halero/schemas";
import type { TasksApi } from "./api";
import { normalizeTasksSearch } from "./helpers/board-search";
import { createNewTaskCommand } from "./new-task-command";
import { createTasksScreen } from "./tasks-screen";

export type {
  Task,
  TaskBoard,
  TaskFilter,
  TaskList,
  TaskPriority,
  TaskStatus,
  TasksToday,
} from "../contract";
export type {
  TaskCreateInput,
  TaskLogTimeInput,
  TaskMoveInput,
  TasksApi,
  TaskUpdateInput,
} from "./api";
export { withTasksInvalidation } from "./queries";
export { createTasksTodaySection } from "./today-due-section";

export const createTasksWebModule = (api: TasksApi): WebModule =>
  defineWebModule({
    id: "tasks",
    nav: [{ label: "Tasks", path: "/tasks", order: 30 }],
    pages: [
      {
        path: "/tasks",
        component: createTasksScreen(api),
        validateSearch: normalizeTasksSearch,
      },
    ],
    entityLinks: [
      {
        kind: TASK_ITEM_KIND,
        label: "Task",
        // v0.2 has no per-task anchor; the list page carries every task,
        // so dated and dateless hits land in the same place.
        buildLink: () => ({ path: "/tasks" }),
      },
    ],
    commands: [createNewTaskCommand(api)],
  });
