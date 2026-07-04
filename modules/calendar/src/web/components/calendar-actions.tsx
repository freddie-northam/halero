import { Button, ChevronLeft, ChevronRight } from "@halero/ui";
import type { ReactElement } from "react";
import type { CalendarView } from "../helpers/calendar-search";
import { ViewSwitcher } from "./view-switcher";

export interface CalendarActionsProps {
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

/**
 * The calendar's page-header actions: the primary New event button, the date
 * navigation cluster, and the view switcher. Rendered inside the shared
 * PageHeader's actions slot, so it carries no title of its own.
 */
export const CalendarActions = ({
  label,
  view,
  onViewChange,
  onPrevious,
  onToday,
  onNext,
  navDisabled,
  onNewEvent,
}: CalendarActionsProps): ReactElement => (
  <>
    <Button type="button" disabled={navDisabled} onClick={onNewEvent}>
      New event
    </Button>
    <div className="flex items-center gap-1">
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
  </>
);
