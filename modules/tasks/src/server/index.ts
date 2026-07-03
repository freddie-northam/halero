// The tasks module's server entry: its manifest, the task.item kind
// contribution, and the tasks router. The host wires all of it in
// through its module registry; nothing here imports host code.

import { defineServerModule } from "@halero/module-sdk/server";
import { TASK_ITEM_KIND, taskSatelliteSchema } from "@halero/schemas";
import { TASK_ITEM_SCHEMA_VERSION, tasksRouter } from "./router";

export { TASK_ITEM_SCHEMA_VERSION } from "./router";

export const tasksServerModule = defineServerModule({
  id: "tasks",
  version: "0.1.0",
  entityKinds: [
    {
      kind: TASK_ITEM_KIND,
      schemaVersion: TASK_ITEM_SCHEMA_VERSION,
      schema: taskSatelliteSchema,
      // No satelliteWriter: no connector produces task.item items.
    },
  ],
  router: tasksRouter,
});

export type { Task, TaskList, TasksToday } from "../contract";
