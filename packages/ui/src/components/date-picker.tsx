// The app's shared date-picker: a Button trigger that opens a Popover
// holding the vendored Calendar. Callers only ever see the "YYYY-MM-DD"
// string convention (never a Date); the conversion to and from
// react-day-picker's Date happens entirely inside this file, through
// lib/local-date's timezone-safe helpers.

import type { ReactElement } from "react";
import { useState } from "react";
import { formatLocalDate, parseLocalDate } from "../lib/local-date";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export interface DatePickerProps {
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
  readonly placeholder?: string;
  readonly id?: string;
  readonly "aria-label"?: string;
  readonly disabled?: boolean;
}

/**
 * Formats a "YYYY-MM-DD" string for the trigger label. Reads it at UTC
 * midnight, the app's established display-formatting idiom (see the
 * calendar module's helpers/format.ts), so the label matches the stored
 * calendar date regardless of the browser's own timezone. This is
 * independent of the local-noon conversion the popover's Calendar itself
 * uses (lib/local-date.ts), which instead has to line up with
 * react-day-picker's own local-time day model.
 */
const formatDisplayDate = (value: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));

export const DatePicker = ({
  value,
  onChange,
  placeholder = "Pick a date",
  id,
  "aria-label": ariaLabel,
  disabled = false,
}: DatePickerProps): ReactElement => {
  const [open, setOpen] = useState(false);
  const selectedDate = value === null ? undefined : parseLocalDate(value);

  const handleSelect = (date: Date | undefined): void => {
    if (date === undefined) return;
    onChange(formatLocalDate(date));
    setOpen(false);
  };

  const handleClear = (): void => {
    onChange(null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "w-auto min-w-36 justify-start font-normal",
            value === null && "text-muted-foreground",
          )}
        >
          {value === null ? placeholder : formatDisplayDate(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate}
          onSelect={handleSelect}
          autoFocus
        />
        <div className="flex justify-end border-t p-1.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={value === null}
            onClick={handleClear}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
