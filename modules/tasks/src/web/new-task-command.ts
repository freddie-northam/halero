// The palette's quick-capture command: Cmd+K, type a title, Enter,
// task saved. The host hands this command the registry-wrapped TasksApi,
// so a create invalidates the module's queries without this file ever
// touching query keys.

import type { CommandContribution } from "@halero/module-sdk/web";
import type { TasksApi } from "./api";

export const createNewTaskCommand = (api: TasksApi): CommandContribution => ({
  id: "tasks.new",
  describe: (input) => {
    const title = input.trim();
    return title === "" ? "New task..." : `New task: ${title}`;
  },
  run: async (input) => {
    // The palette passes its raw input; trimming is this command's job.
    const title = input.trim();
    if (title === "") {
      // The same sentence the server rejects a blank title with.
      throw new Error("A task needs a title.");
    }
    await api.create({ title });
    // Capture confirms by landing on the tasks page.
    return { message: "Task added.", navigateTo: { path: "/tasks" } };
  },
});
