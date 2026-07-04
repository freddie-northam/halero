// The add-widget control: a popover listing every registered widget,
// grouped by category, that adds one to the current board. It reports the
// chosen WidgetDef; the screen mints the instance id and default size, so
// this control stays free of layout bookkeeping.

import { Button, Popover, PopoverContent, PopoverTrigger } from "@halero/ui";
import { type ReactElement, useState } from "react";
import { WIDGET_LIST, type WidgetDef } from "../widgets/registry";

export interface AddWidgetProps {
  readonly onAdd: (def: WidgetDef) => void;
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

export const AddWidget = ({ onAdd }: AddWidgetProps): ReactElement => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Add widget
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="flex flex-col gap-3">
          {byCategory().map(([category, defs]) => (
            <div key={category} className="flex flex-col gap-1">
              <p className="px-1 text-xs font-medium text-muted-foreground">
                {category}
              </p>
              {defs.map((def) => (
                <button
                  key={def.type}
                  type="button"
                  className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => {
                    onAdd(def);
                    setOpen(false);
                  }}
                >
                  {def.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
