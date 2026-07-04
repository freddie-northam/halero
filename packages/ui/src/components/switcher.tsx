// A single, consistent tab switcher for the whole app: a row of text
// labels with an underline under the active one (the "Your Usage / Your
// Voice / Leaderboard" pattern), not pill tabs. Controlled: the caller owns
// the value. Kept deliberately small and unopinionated so every switcher
// (board tabs, view toggles, section tabs) looks the same.

import type { ReactElement } from "react";
import { cn } from "../lib/utils";

export interface SwitcherOption {
  readonly value: string;
  readonly label: string;
}

export interface SwitcherProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly SwitcherOption[];
  /** Names the group for assistive tech, e.g. "Boards". */
  readonly ariaLabel: string;
  readonly className?: string;
}

export const Switcher = ({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
}: SwitcherProps): ReactElement => (
  <div
    role="tablist"
    aria-label={ariaLabel}
    className={cn(
      "flex items-center gap-5 overflow-x-auto border-b",
      className,
    )}
  >
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onValueChange(option.value)}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-0.5 pb-2 text-sm transition-colors",
            active
              ? "border-foreground font-semibold text-foreground"
              : "border-transparent font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
