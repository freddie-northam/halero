// The add-widget control: a popover listing every registered widget,
// grouped by category, that adds one to the current board. It reports the
// chosen WidgetDef; the screen mints the instance id and default size, so
// this control stays free of layout bookkeeping.

import {
  Button,
  Check,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@halero/ui";
import { type ReactElement, useState } from "react";
import { WIDGET_LIST, type WidgetDef } from "../widgets/registry";

export interface AddWidgetProps {
  readonly onAdd: (def: WidgetDef) => void;
  /** Widget types already on the board; shown as added and not re-addable. */
  readonly existingTypes: ReadonlySet<string>;
}

/** The registry grouped by category, preserving each group's first-seen order. */
const byCategory = (): readonly (readonly [string, readonly WidgetDef[]])[] => {
  const groups = new Map<string, WidgetDef[]>();
  for (const def of WIDGET_LIST) {
    const existing = groups.get(def.category);
    if (existing === undefined) {
      groups.set(def.category, [def]);
    } else {
      existing.push(def);
    }
  }
  return [...groups.entries()];
};

export const AddWidget = ({
  onAdd,
  existingTypes,
}: AddWidgetProps): ReactElement => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Add widget
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[70vh] w-64 overflow-y-auto p-2"
      >
        <div className="flex flex-col gap-3">
          {byCategory().map(([category, defs]) => (
            <div key={category} className="flex flex-col gap-1">
              <p className="px-1 text-xs font-medium text-muted-foreground">
                {category}
              </p>
              {defs.map((def) => {
                const added = existingTypes.has(def.type);
                return (
                  <button
                    key={def.type}
                    type="button"
                    disabled={added}
                    aria-disabled={added}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent"
                    onClick={() => {
                      if (added) {
                        return;
                      }
                      onAdd(def);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{def.title}</span>
                    {added ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs">
                        <Check aria-hidden="true" className="size-3.5" />
                        Added
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
