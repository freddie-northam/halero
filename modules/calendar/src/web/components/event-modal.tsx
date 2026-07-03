// The create/edit/delete surface for a user's OWN calendar event, shaped
// like TaskDetailDialog: Dialog + DialogContent, a form keyed by the
// target so it remounts fresh, uncontrolled text fields read from
// FormData at submit, controlled state only for the pickers, a run()
// wrapper that catches and shows readableError, and Delete (ghost) +
// Save. Google-synced events never reach this component: the context
// panel's Edit button, the only path in, renders only when editable.

import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  DatePicker,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Separator,
} from "@halero/ui";
import { type FormEvent, type ReactElement, useState } from "react";
import type { AgendaEvent } from "../../contract";
import type { CalendarEventInput, CalendarEventUpdateInput } from "../api";
import { formatDateInZone, formatTime } from "../helpers/format";
import { readableError } from "../readable-error";

export type EventModalTarget =
  | { readonly mode: "create"; readonly date: string }
  | { readonly mode: "edit"; readonly event: AgendaEvent };

export interface EventModalProps {
  readonly target: EventModalTarget | null;
  /** The server-provided home timezone; the client does no tz math itself. */
  readonly timeZone: string;
  readonly onClose: () => void;
  readonly onCreate: (input: CalendarEventInput) => Promise<void>;
  readonly onUpdate: (input: CalendarEventUpdateInput) => Promise<void>;
  readonly onDelete: (entityId: string) => Promise<void>;
}

const targetKey = (target: EventModalTarget): string =>
  target.mode === "create"
    ? `create:${target.date}`
    : `edit:${target.event.entityId}`;

interface Prefill {
  readonly title: string;
  readonly allDay: boolean;
  readonly date: string;
  readonly endDate: string | null;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly location: string;
  readonly notes: string;
  readonly url: string;
}

/** Every wall-clock field derives from the event's epochs plus the
 * server's home timezone; this never touches the browser's own tz. */
const prefillOf = (target: EventModalTarget, timeZone: string): Prefill => {
  if (target.mode === "create") {
    return {
      title: "",
      allDay: true,
      date: target.date,
      endDate: null,
      startTime: null,
      endTime: null,
      location: "",
      notes: "",
      url: "",
    };
  }
  const { event } = target;
  const date = formatDateInZone(event.start, timeZone);
  const inclusiveEnd = formatDateInZone(event.end - 1, timeZone);
  return {
    title: event.title,
    allDay: event.allDay,
    date,
    endDate: event.allDay && inclusiveEnd !== date ? inclusiveEnd : null,
    startTime: event.allDay ? null : formatTime(event.start, timeZone),
    endTime: event.allDay ? null : formatTime(event.end, timeZone),
    location: event.location ?? "",
    notes: event.notes ?? "",
    url: event.url ?? "",
  };
};

interface RawFields {
  readonly title: string;
  readonly location?: string;
  readonly notes?: string;
  readonly url?: string;
  readonly startTime?: string;
  readonly endTime?: string;
}

/** Blank optional text clears the field: the caller omits it entirely so
 * an edit's full-replace update drops it server-side. */
const trimmedOrUndefined = (
  raw: FormDataEntryValue | null,
): string | undefined => {
  const value = String(raw ?? "").trim();
  return value === "" ? undefined : value;
};

const readRawFields = (form: HTMLFormElement): RawFields => {
  const data = new FormData(form);
  return {
    title: String(data.get("title") ?? "").trim(),
    location: trimmedOrUndefined(data.get("location")),
    notes: trimmedOrUndefined(data.get("notes")),
    url: trimmedOrUndefined(data.get("url")),
    startTime: trimmedOrUndefined(data.get("startTime")),
    endTime: trimmedOrUndefined(data.get("endTime")),
  };
};

type ValidatedInput =
  | { readonly ok: true; readonly input: CalendarEventInput }
  | { readonly ok: false; readonly error: string };

/** Optional text fields are only added when present, so a cleared field
 * is genuinely OMITTED from the payload rather than sent as undefined. */
const baseInput = (
  raw: RawFields,
  allDay: boolean,
  date: string,
): CalendarEventInput => ({
  title: raw.title,
  allDay,
  date,
  ...(raw.location === undefined ? {} : { location: raw.location }),
  ...(raw.notes === undefined ? {} : { notes: raw.notes }),
  ...(raw.url === undefined ? {} : { url: raw.url }),
});

const validatedTimedInput = (
  raw: RawFields,
  base: CalendarEventInput,
): ValidatedInput => {
  if (raw.startTime === undefined || raw.endTime === undefined) {
    return { ok: false, error: "A timed event needs a start and end time." };
  }
  if (!(raw.endTime > raw.startTime)) {
    return {
      ok: false,
      error: "An event's end time must be after its start time.",
    };
  }
  return {
    ok: true,
    input: { ...base, startTime: raw.startTime, endTime: raw.endTime },
  };
};

const validatedAllDayInput = (
  base: CalendarEventInput,
  date: string,
  endDate: string | null,
): ValidatedInput => {
  if (endDate !== null && endDate < date) {
    return {
      ok: false,
      error: "An event's end date cannot be before its start date.",
    };
  }
  return {
    ok: true,
    input: endDate !== null && endDate > date ? { ...base, endDate } : base,
  };
};

const validatedInput = (
  raw: RawFields,
  allDay: boolean,
  date: string | null,
  endDate: string | null,
): ValidatedInput => {
  if (raw.title === "") {
    return { ok: false, error: "An event needs a title." };
  }
  if (date === null) {
    return { ok: false, error: "An event needs a date." };
  }
  const base = baseInput(raw, allDay, date);
  return allDay
    ? validatedAllDayInput(base, date, endDate)
    : validatedTimedInput(raw, base);
};

/**
 * Owns the dialog's editable state (all-day, date, end date) and both
 * writes. run() wraps create/update/delete the same way the task detail
 * dialog's own run() does, so a rejected write surfaces a readable error
 * instead of an unhandled rejection.
 */
const useEventForm = (
  target: EventModalTarget,
  timeZone: string,
  onCreate: (input: CalendarEventInput) => Promise<void>,
  onUpdate: (input: CalendarEventUpdateInput) => Promise<void>,
  onDelete: (entityId: string) => Promise<void>,
) => {
  const prefill = prefillOf(target, timeZone);
  const [allDay, setAllDay] = useState(prefill.allDay);
  const [date, setDate] = useState<string | null>(prefill.date);
  const [endDate, setEndDate] = useState<string | null>(prefill.endDate);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (thrown) {
      setError(readableError(thrown));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const raw = readRawFields(event.currentTarget);
    const validated = validatedInput(raw, allDay, date, endDate);
    if (!validated.ok) {
      setError(validated.error);
      return;
    }
    void run(() =>
      target.mode === "create"
        ? onCreate(validated.input)
        : onUpdate({ ...validated.input, entityId: target.event.entityId }),
    );
  };

  return {
    prefill,
    allDay,
    setAllDay,
    date,
    setDate,
    endDate,
    setEndDate,
    error,
    busy,
    submit,
    remove:
      target.mode === "edit"
        ? () => void run(() => onDelete(target.event.entityId))
        : undefined,
  };
};

const Fields = ({
  prefill,
  allDay,
  onAllDayChange,
  date,
  onDateChange,
  endDate,
  onEndDateChange,
}: {
  readonly prefill: Prefill;
  readonly allDay: boolean;
  readonly onAllDayChange: (value: boolean) => void;
  readonly date: string | null;
  readonly onDateChange: (value: string | null) => void;
  readonly endDate: string | null;
  readonly onEndDateChange: (value: string | null) => void;
}): ReactElement => (
  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
    <Input name="title" aria-label="Title" defaultValue={prefill.title} />
    <div className="flex items-center gap-2">
      <Checkbox
        id="event-all-day"
        checked={allDay}
        onCheckedChange={(checked) => onAllDayChange(checked === true)}
      />
      <Label htmlFor="event-all-day">All day</Label>
    </div>
    <div className="flex items-center gap-2">
      <DatePicker
        value={date}
        onChange={onDateChange}
        placeholder="Date"
        aria-label="Date"
      />
      {allDay ? (
        <DatePicker
          value={endDate}
          onChange={onEndDateChange}
          placeholder="End date (optional)"
          aria-label="End date"
        />
      ) : null}
    </div>
    {allDay ? null : (
      <div className="flex items-center gap-2">
        <Input
          name="startTime"
          type="time"
          aria-label="Start time"
          defaultValue={prefill.startTime ?? ""}
        />
        <Input
          name="endTime"
          type="time"
          aria-label="End time"
          defaultValue={prefill.endTime ?? ""}
        />
      </div>
    )}
    <Input
      name="location"
      aria-label="Location"
      placeholder="Location"
      defaultValue={prefill.location}
    />
    <textarea
      name="notes"
      aria-label="Notes"
      className="min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
      defaultValue={prefill.notes}
    />
    <Input
      name="url"
      aria-label="Link"
      placeholder="Link (optional)"
      defaultValue={prefill.url}
    />
  </div>
);

const EventForm = ({
  target,
  timeZone,
  onCreate,
  onUpdate,
  onDelete,
}: {
  readonly target: EventModalTarget;
  readonly timeZone: string;
  readonly onCreate: (input: CalendarEventInput) => Promise<void>;
  readonly onUpdate: (input: CalendarEventUpdateInput) => Promise<void>;
  readonly onDelete: (entityId: string) => Promise<void>;
}): ReactElement => {
  const form = useEventForm(target, timeZone, onCreate, onUpdate, onDelete);
  return (
    <form onSubmit={form.submit} className="flex h-full min-h-0 flex-col">
      <DialogHeader className="p-4">
        <DialogTitle>
          {target.mode === "create" ? "New event" : "Edit event"}
        </DialogTitle>
      </DialogHeader>
      <Fields
        prefill={form.prefill}
        allDay={form.allDay}
        onAllDayChange={form.setAllDay}
        date={form.date}
        onDateChange={form.setDate}
        endDate={form.endDate}
        onEndDateChange={form.setEndDate}
      />
      {form.error === null ? null : (
        <Alert variant="destructive" className="mx-4">
          <AlertDescription>{form.error}</AlertDescription>
        </Alert>
      )}
      <Separator />
      <div className="flex items-center justify-between p-4">
        {form.remove === undefined ? (
          <span />
        ) : (
          <Button
            type="button"
            variant="ghost"
            disabled={form.busy}
            onClick={form.remove}
          >
            Delete
          </Button>
        )}
        <Button type="submit" disabled={form.busy}>
          Save
        </Button>
      </div>
    </form>
  );
};

export const EventModal = ({
  target,
  timeZone,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: EventModalProps): ReactElement => (
  <Dialog
    open={target !== null}
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
  >
    <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0">
      {target === null ? null : (
        <EventForm
          key={targetKey(target)}
          target={target}
          timeZone={timeZone}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      )}
    </DialogContent>
  </Dialog>
);
