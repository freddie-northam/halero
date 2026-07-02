import { Tabs, TabsList, TabsTrigger } from "@halero/ui";
import type { ReactElement } from "react";
import type { CalendarView } from "../helpers/calendar-search";

export interface ViewSwitcherProps {
  readonly view: CalendarView;
  readonly onViewChange: (view: CalendarView) => void;
}

const isCalendarView = (value: string): value is CalendarView =>
  value === "month" || value === "week" || value === "agenda";

/**
 * The month/week/agenda switcher. Radix tabs give the keyboard model
 * (roving focus, arrow keys) and correct aria-selected for free; the
 * value is controlled by the URL, so switching is a navigation.
 */
export const ViewSwitcher = ({
  view,
  onViewChange,
}: ViewSwitcherProps): ReactElement => (
  <Tabs
    value={view}
    onValueChange={(value) => {
      if (isCalendarView(value)) {
        onViewChange(value);
      }
    }}
  >
    <TabsList aria-label="Calendar view">
      <TabsTrigger value="month">Month</TabsTrigger>
      <TabsTrigger value="week">Week</TabsTrigger>
      <TabsTrigger value="agenda">Agenda</TabsTrigger>
    </TabsList>
  </Tabs>
);
