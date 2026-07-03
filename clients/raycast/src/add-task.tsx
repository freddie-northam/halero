// The Add Task command (no-view): creates a task from the root-search
// arguments and confirms with a HUD. Validation stays on the server
// (modules.tasks.create), so its readable rejections, like a malformed
// due date or an empty title, surface in the failure toast as-is.

import { type LaunchProps, showHUD } from "@raycast/api";
import { createHaleroClient, getPrefs, hasApiToken } from "./api";
import { showApiFailureToast, showMissingTokenToast } from "./feedback";
import { type AddTaskArguments, taskCreateInput } from "./task-helpers";

export default async function addTask(
  props: LaunchProps<{ arguments: AddTaskArguments }>,
): Promise<void> {
  const prefs = getPrefs();
  if (!hasApiToken(prefs)) {
    await showMissingTokenToast();
    return;
  }
  const client = createHaleroClient(prefs);
  try {
    await client.modules.tasks.create.mutate(taskCreateInput(props.arguments));
    await showHUD("Task added.");
  } catch (error) {
    await showApiFailureToast(error, prefs.baseUrl);
  }
}
