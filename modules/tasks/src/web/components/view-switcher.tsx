import { Tabs, TabsList, TabsTrigger } from "@halero/ui";
import type { ReactElement } from "react";
import type { TasksView } from "../helpers/board-search";

export interface TasksViewSwitcherProps {
  readonly view: TasksView;
  readonly onViewChange: (view: TasksView) => void;
}

const isTasksView = (value: string): value is TasksView =>
  value === "board" || value === "list";

/**
 * The Board/List switcher, the same Tabs + URL-driven pattern as the
 * calendar module's view switcher: value is controlled by the URL, so
 * switching is a navigation rather than local state.
 */
export const TasksViewSwitcher = ({
  view,
  onViewChange,
}: TasksViewSwitcherProps): ReactElement => (
  <Tabs
    value={view}
    onValueChange={(value) => {
      if (isTasksView(value)) {
        onViewChange(value);
      }
    }}
  >
    <TabsList aria-label="Tasks view">
      <TabsTrigger value="board">Board</TabsTrigger>
      <TabsTrigger value="list">List</TabsTrigger>
    </TabsList>
  </Tabs>
);
