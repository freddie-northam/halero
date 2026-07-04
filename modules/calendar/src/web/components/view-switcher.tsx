import { Switcher, type SwitcherOption } from "@halero/ui";
import type { ReactElement } from "react";
import type { CalendarView } from "../helpers/calendar-search";

export interface ViewSwitcherProps {
  readonly view: CalendarView;
  readonly onViewChange: (view: CalendarView) => void;
}

const isCalendarView = (value: string): value is CalendarView =>
  value === "month" ||
  value === "week" ||
  value === "agenda" ||
  value === "list";

const OPTIONS: readonly SwitcherOption[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "agenda", label: "Agenda" },
  { value: "list", label: "List" },
];

/**
 * The month/week/agenda/list switcher, on the shared underline Switcher so
 * every switcher in the app looks the same. The value is controlled by the
 * URL, so switching is a navigation.
 */
export const ViewSwitcher = ({
  view,
  onViewChange,
}: ViewSwitcherProps): ReactElement => (
  <Switcher
    ariaLabel="Calendar view"
    value={view}
    onValueChange={(value) => {
      if (isCalendarView(value)) {
        onViewChange(value);
      }
    }}
    options={OPTIONS}
  />
);
