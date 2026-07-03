import { Button } from "@halero/ui";
import type { ReactElement } from "react";
import type { TaskPriority } from "../../contract";
import { priorityLabel } from "../helpers/board-style";

export interface PriorityPickerProps {
  readonly value: TaskPriority | null;
  readonly onChange: (value: TaskPriority | null) => void;
}

const PRIORITIES: readonly TaskPriority[] = ["high", "medium", "low"];

/**
 * A segmented control rather than a Select: three exclusive options are
 * easier to hit and to test than a popover listbox. Clicking the active
 * option clears it back to no priority.
 */
export const PriorityPicker = ({
  value,
  onChange,
}: PriorityPickerProps): ReactElement => (
  <div role="radiogroup" aria-label="Priority" className="flex gap-1.5">
    {PRIORITIES.map((priority) => (
      <Button
        key={priority}
        type="button"
        role="radio"
        aria-checked={value === priority}
        variant={value === priority ? "default" : "outline"}
        size="sm"
        onClick={() => onChange(value === priority ? null : priority)}
      >
        {priorityLabel(priority)}
      </Button>
    ))}
  </div>
);
