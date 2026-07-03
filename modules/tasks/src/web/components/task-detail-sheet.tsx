// The board card's edit surface: title, notes, tags, priority, due
// date, and estimate, saved through api.update() and deleted through
// api.delete(). Title, notes, and the estimate are uncontrolled fields
// read from FormData at submit (the app's established text-input
// pattern, see QuickAddForm and the Settings forms); only priority,
// tags, and the due date need React state, and all three change through
// clicks rather than typing. Keying the form by the task's entityId
// remounts it fresh whenever a different card opens, which both resets
// that state and re-seeds the uncontrolled fields' defaultValue.

import {
  Alert,
  AlertDescription,
  Button,
  DatePicker,
  Input,
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@halero/ui";
import { type FormEvent, type ReactElement, useState } from "react";
import type { Task, TaskPriority } from "../../contract";
import type { TaskUpdateInput } from "../api";
import { readableError } from "../readable-error";
import { PriorityPicker } from "./priority-picker";
import { TagEditor } from "./tag-editor";

export interface TaskDetailSheetProps {
  readonly task: Task | null;
  readonly onClose: () => void;
  readonly onSave: (input: TaskUpdateInput) => Promise<void>;
  readonly onDelete: (entityId: string) => Promise<void>;
}

/** Blank clears the estimate; otherwise it must be whole minutes, zero or more. */
const parsedEstimate = (raw: string): number | null | undefined => {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
};

/** The uncontrolled fields read from FormData, or a readable error. */
type ReadResult =
  | {
      readonly ok: true;
      readonly title: string;
      readonly notes: string | null;
      readonly estimateMinutes: number | null;
    }
  | { readonly ok: false; readonly error: string };

const readFormFields = (form: HTMLFormElement): ReadResult => {
  const data = new FormData(form);
  const title = String(data.get("title") ?? "").trim();
  if (title === "") {
    return { ok: false, error: "A task needs a title." };
  }
  const estimateMinutes = parsedEstimate(String(data.get("estimate") ?? ""));
  if (estimateMinutes === undefined) {
    return {
      ok: false,
      error: "The estimate must be a whole number of minutes, zero or more.",
    };
  }
  const notes = String(data.get("notes") ?? "").trim();
  return {
    ok: true,
    title,
    notes: notes === "" ? null : notes,
    estimateMinutes,
  };
};

const DetailFields = ({
  task,
  priority,
  onPriorityChange,
  tags,
  onTagsChange,
  dueDate,
  onDueDateChange,
}: {
  readonly task: Task;
  readonly priority: TaskPriority | null;
  readonly onPriorityChange: (priority: TaskPriority | null) => void;
  readonly tags: readonly string[];
  readonly onTagsChange: (tags: readonly string[]) => void;
  readonly dueDate: string | null;
  readonly onDueDateChange: (dueDate: string | null) => void;
}): ReactElement => (
  <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
    <Input name="title" aria-label="Title" defaultValue={task.title} />
    <textarea
      name="notes"
      aria-label="Notes"
      className="min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
      defaultValue={task.notes ?? ""}
    />
    <PriorityPicker value={priority} onChange={onPriorityChange} />
    <TagEditor tags={tags} onChange={onTagsChange} />
    <div className="flex items-center gap-2">
      <DatePicker
        value={dueDate}
        onChange={onDueDateChange}
        placeholder="Due date"
        aria-label="Due date"
      />
      <Input
        name="estimate"
        aria-label="Estimate (minutes)"
        inputMode="numeric"
        placeholder="Estimate (min)"
        defaultValue={
          task.estimateMinutes === null ? "" : String(task.estimateMinutes)
        }
      />
    </div>
  </div>
);

/**
 * Owns the sheet's editable state and both writes. `run` wraps save and
 * delete the same way ListView's own run() does, so a rejected delete
 * surfaces a readable error instead of an unhandled promise rejection.
 */
const useTaskDetailForm = (
  task: Task,
  onSave: (input: TaskUpdateInput) => Promise<void>,
  onDelete: (entityId: string) => Promise<void>,
) => {
  const [priority, setPriority] = useState(task.priority);
  const [tags, setTags] = useState<readonly string[]>(task.tags);
  const [dueDate, setDueDate] = useState(task.dueDate);
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
    const fields = readFormFields(event.currentTarget);
    if (!fields.ok) {
      setError(fields.error);
      return;
    }
    void run(() =>
      onSave({
        entityId: task.entityId,
        title: fields.title,
        notes: fields.notes,
        priority,
        tags,
        dueDate,
        estimateMinutes: fields.estimateMinutes,
      }),
    );
  };

  return {
    priority,
    setPriority,
    tags,
    setTags,
    dueDate,
    setDueDate,
    error,
    busy,
    submit,
    remove: () => void run(() => onDelete(task.entityId)),
  };
};

const TaskDetailForm = ({
  task,
  onSave,
  onDelete,
}: {
  readonly task: Task;
  readonly onSave: (input: TaskUpdateInput) => Promise<void>;
  readonly onDelete: (entityId: string) => Promise<void>;
}): ReactElement => {
  const form = useTaskDetailForm(task, onSave, onDelete);
  return (
    <form onSubmit={form.submit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>Edit task</SheetTitle>
      </SheetHeader>
      <DetailFields
        task={task}
        priority={form.priority}
        onPriorityChange={form.setPriority}
        tags={form.tags}
        onTagsChange={form.setTags}
        dueDate={form.dueDate}
        onDueDateChange={form.setDueDate}
      />
      {form.error === null ? null : (
        <Alert variant="destructive" className="mx-4">
          <AlertDescription>{form.error}</AlertDescription>
        </Alert>
      )}
      <Separator />
      <div className="flex items-center justify-between p-4">
        <Button
          type="button"
          variant="ghost"
          disabled={form.busy}
          onClick={form.remove}
        >
          Delete
        </Button>
        <Button type="submit" disabled={form.busy}>
          Save
        </Button>
      </div>
    </form>
  );
};

export const TaskDetailSheet = ({
  task,
  onClose,
  onSave,
  onDelete,
}: TaskDetailSheetProps): ReactElement => (
  <Sheet
    open={task !== null}
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
  >
    <SheetContent>
      {task === null ? null : (
        <TaskDetailForm
          key={task.entityId}
          task={task}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
    </SheetContent>
  </Sheet>
);
