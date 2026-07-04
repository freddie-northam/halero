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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Separator,
} from "@halero/ui";
import {
  type FormEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useRef,
  useState,
} from "react";
import type { Task, TaskPriority } from "../../contract";
import type { TaskUpdateInput } from "../api";
import { formatMinutes } from "../helpers/format-minutes";
import { readableError } from "../readable-error";
import { PriorityPicker } from "./priority-picker";
import { TagEditor } from "./tag-editor";

export interface TaskDetailDialogProps {
  readonly task: Task | null;
  readonly onClose: () => void;
  readonly onSave: (input: TaskUpdateInput) => Promise<void>;
  readonly onDelete: (entityId: string) => Promise<void>;
  readonly onLogTime: (entityId: string, minutes: number) => Promise<void>;
  /**
   * Host slot for the entity's relationships. The module stays decoupled
   * from the host's link registry and router: the host injects a rendered
   * panel keyed to the task's entity id, or nothing.
   */
  readonly renderRelated?: (entityId: string) => ReactNode;
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

/** Whole minutes, nonzero (negative corrects an over-log); blank/bad input is undefined. */
const parsedLogMinutes = (raw: string): number | undefined => {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return undefined;
  }
  const value = Number(trimmed);
  return Number.isInteger(value) && value !== 0 ? value : undefined;
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

/** The quick-log row: fixed increments alongside the free-entry input. */
const QUICK_LOG_MINUTES: readonly {
  readonly label: string;
  readonly minutes: number;
}[] = [
  { label: "+15m", minutes: 15 },
  { label: "+30m", minutes: 30 },
  { label: "+1h", minutes: 60 },
];

/**
 * The running logged total plus its input. The minutes field is
 * uncontrolled (the app's established typed-input pattern, see
 * TagEditor's add field) and read through the ref at log time. Enter is
 * intercepted (preventDefault) so it logs time instead of submitting
 * the surrounding form, which would otherwise save and close the dialog.
 */
const TimeLogSection = ({
  task,
  inputRef,
  onLogTime,
  busy,
}: {
  readonly task: Task;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onLogTime: (minutes?: number) => void;
  readonly busy: boolean;
}): ReactElement => (
  <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
    <p className="tnum font-medium">{`Logged ${formatMinutes(task.loggedMinutes)}`}</p>
    <div className="flex items-center gap-2">
      <Input
        ref={inputRef}
        aria-label="Minutes to log"
        inputMode="numeric"
        placeholder="Minutes"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onLogTime();
          }
        }}
      />
      <Button variant="secondary" disabled={busy} onClick={() => onLogTime()}>
        Log time
      </Button>
    </div>
    <div className="flex gap-1">
      {QUICK_LOG_MINUTES.map((option) => (
        <Button
          key={option.label}
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onLogTime(option.minutes)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  </div>
);

const DetailFields = ({
  task,
  priority,
  onPriorityChange,
  tags,
  onTagsChange,
  dueDate,
  onDueDateChange,
  logMinutesRef,
  onLogTime,
  busy,
}: {
  readonly task: Task;
  readonly priority: TaskPriority | null;
  readonly onPriorityChange: (priority: TaskPriority | null) => void;
  readonly tags: readonly string[];
  readonly onTagsChange: (tags: readonly string[]) => void;
  readonly dueDate: string | null;
  readonly onDueDateChange: (dueDate: string | null) => void;
  readonly logMinutesRef: RefObject<HTMLInputElement | null>;
  readonly onLogTime: (minutes?: number) => void;
  readonly busy: boolean;
}): ReactElement => (
  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
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
    <TimeLogSection
      task={task}
      inputRef={logMinutesRef}
      onLogTime={onLogTime}
      busy={busy}
    />
  </div>
);

/**
 * Owns the free-entry minutes field and both ways to log time (typed or
 * a fixed quick-pick, which bypasses the field entirely). Split out of
 * useTaskDetailForm to keep that hook a manageable size.
 */
const useLogTimeControl = (
  task: Task,
  onLogTime: (entityId: string, minutes: number) => Promise<void>,
  run: (action: () => Promise<void>) => Promise<void>,
  setError: (error: string) => void,
) => {
  const logMinutesRef = useRef<HTMLInputElement>(null);

  const logTime = (minutes?: number): void => {
    const field = logMinutesRef.current;
    const value = minutes ?? parsedLogMinutes(field?.value ?? "");
    if (value === undefined) {
      setError("Enter a non-zero whole number of minutes.");
      return;
    }
    void run(async () => {
      await onLogTime(task.entityId, value);
      if (field !== null) {
        field.value = "";
      }
    });
  };

  return { logMinutesRef, logTime };
};

/**
 * Owns the dialog's editable state and both writes. `run` wraps save and
 * delete the same way ListView's own run() does, so a rejected delete
 * surfaces a readable error instead of an unhandled promise rejection.
 */
const useTaskDetailForm = (
  task: Task,
  onSave: (input: TaskUpdateInput) => Promise<void>,
  onDelete: (entityId: string) => Promise<void>,
  onLogTime: (entityId: string, minutes: number) => Promise<void>,
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
  const { logMinutesRef, logTime } = useLogTimeControl(
    task,
    onLogTime,
    run,
    setError,
  );

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
    logMinutesRef,
    logTime,
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
  onLogTime,
  renderRelated,
}: {
  readonly task: Task;
  readonly onSave: (input: TaskUpdateInput) => Promise<void>;
  readonly onDelete: (entityId: string) => Promise<void>;
  readonly onLogTime: (entityId: string, minutes: number) => Promise<void>;
  readonly renderRelated?: (entityId: string) => ReactNode;
}): ReactElement => {
  const form = useTaskDetailForm(task, onSave, onDelete, onLogTime);
  return (
    <form onSubmit={form.submit} className="flex h-full min-h-0 flex-col">
      <DialogHeader className="p-4">
        <DialogTitle>Edit task</DialogTitle>
      </DialogHeader>
      <DetailFields
        task={task}
        priority={form.priority}
        onPriorityChange={form.setPriority}
        tags={form.tags}
        onTagsChange={form.setTags}
        dueDate={form.dueDate}
        onDueDateChange={form.setDueDate}
        logMinutesRef={form.logMinutesRef}
        onLogTime={form.logTime}
        busy={form.busy}
      />
      {form.error === null ? null : (
        <Alert variant="destructive" className="mx-4">
          <AlertDescription>{form.error}</AlertDescription>
        </Alert>
      )}
      {renderRelated ? (
        <div className="px-4 pb-2">{renderRelated(task.entityId)}</div>
      ) : null}
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

export const TaskDetailDialog = ({
  task,
  onClose,
  onSave,
  onDelete,
  onLogTime,
  renderRelated,
}: TaskDetailDialogProps): ReactElement => (
  <Dialog
    open={task !== null}
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
  >
    <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0">
      {task === null ? null : (
        <TaskDetailForm
          key={task.entityId}
          task={task}
          onSave={onSave}
          onDelete={onDelete}
          onLogTime={onLogTime}
          renderRelated={renderRelated}
        />
      )}
    </DialogContent>
  </Dialog>
);
