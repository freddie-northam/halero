import { Button, ChevronLeft, ChevronRight } from "@halero/ui";
import type { ReactElement } from "react";
import type { CalendarView } from "../helpers/calendar-search";
import { ViewSwitcher } from "./view-switcher";

export interface CalendarHeaderProps {
  /** The current range, e.g. "July 2026"; empty while the anchor loads. */
  readonly label: string;
  readonly view: CalendarView;
  readonly onViewChange: (view: CalendarView) => void;
  readonly onPrevious: () => void;
  readonly onToday: () => void;
  readonly onNext: () => void;
  /** Navigation needs an anchor; disabled until the server provides one. */
  readonly navDisabled: boolean;
  /** Opens the create modal anchored on the currently viewed date. */
  readonly onNewEvent: () => void;
}

/** Title row plus the date navigation, New event action, and view switcher. */
export const CalendarHeader = ({
  label,
  view,
  onViewChange,
  onPrevious,
  onToday,
  onNext,
  navDisabled,
  onNewEvent,
}: CalendarHeaderProps): ReactElement => (
  <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
    <h1 className="text-lg font-semibold tracking-tight">Calendar</h1>
    <Button type="button" size="sm" disabled={navDisabled} onClick={onNewEvent}>
      New event
    </Button>
    <div className="ml-auto flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Previous"
        disabled={navDisabled}
        onClick={onPrevious}
      >
        <ChevronLeft />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={navDisabled}
        onClick={onToday}
      >
        Today
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Next"
        disabled={navDisabled}
        onClick={onNext}
      >
        <ChevronRight />
      </Button>
      <span className="tnum ml-2 min-w-0 text-sm font-medium">{label}</span>
    </div>
    <ViewSwitcher view={view} onViewChange={onViewChange} />
  </header>
);
