import { Switcher, type SwitcherOption } from "@halero/ui";
import type { ReactElement } from "react";
import type { TasksView } from "../helpers/board-search";

export interface TasksViewSwitcherProps {
  readonly view: TasksView;
  readonly onViewChange: (view: TasksView) => void;
}

const isTasksView = (value: string): value is TasksView =>
  value === "board" || value === "list";

const OPTIONS: readonly SwitcherOption[] = [
  { value: "board", label: "Board" },
  { value: "list", label: "List" },
];

/**
 * The Board/List switcher, on the shared underline Switcher so every
 * switcher in the app looks the same. The value is controlled by the URL,
 * so switching is a navigation rather than local state.
 */
export const TasksViewSwitcher = ({
  view,
  onViewChange,
}: TasksViewSwitcherProps): ReactElement => (
  <Switcher
    ariaLabel="Tasks view"
    value={view}
    onValueChange={(value) => {
      if (isTasksView(value)) {
        onViewChange(value);
      }
    }}
    options={OPTIONS}
  />
);
