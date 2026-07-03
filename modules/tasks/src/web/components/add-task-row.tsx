// The board's per-column "+ Add task" affordance: a subtle row at the
// bottom of a column. Clicking reveals a one-line title input (autofocus);
// Enter creates a task in the column's own status; Escape or losing focus
// cancels and hides the input again. The title stays an uncontrolled input
// read through FormData at submit, matching the module's other quick-add
// (see quick-add-form.tsx).

import { Button, Input, Plus } from "@halero/ui";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  useState,
} from "react";
import { readableError } from "../readable-error";

export interface AddTaskRowProps {
  readonly onCreate: (title: string) => Promise<void>;
}

/** Closed state: the subtle "+ Add task" trigger. */
const AddTaskTrigger = ({
  onOpen,
}: {
  readonly onOpen: () => void;
}): ReactElement => (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    className="w-full justify-start gap-1.5 text-muted-foreground"
    onClick={onOpen}
  >
    <Plus className="size-4" aria-hidden="true" />
    Add task
  </Button>
);

/** Open state: the one-line title input and any inline error. */
const AddTaskInput = ({
  onSubmit,
  onCancel,
  error,
}: {
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onCancel: () => void;
  readonly error: string | null;
}): ReactElement => {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      onCancel();
    }
  };
  return (
    <form onSubmit={onSubmit}>
      <Input
        name="title"
        autoFocus
        autoComplete="off"
        placeholder="Task title"
        aria-label="Task title"
        onBlur={onCancel}
        onKeyDown={onKeyDown}
      />
      {error === null ? null : (
        <p className="mt-1.5 text-sm text-destructive">{error}</p>
      )}
    </form>
  );
};

export const AddTaskRow = ({ onCreate }: AddTaskRowProps): ReactElement => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    setOpen(false);
    setError(null);
  };

  // Blur and Escape cancel the row, but never mid-save: a pending create
  // can still reject, and closing here would clear the error before it
  // ever renders. The submit path closes the row itself once it resolves.
  const cancel = (): void => {
    if (!saving) {
      close();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (saving) {
      return;
    }
    const title = String(
      new FormData(event.currentTarget).get("title") ?? "",
    ).trim();
    if (title === "") {
      close();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate(title);
      close();
    } catch (thrown) {
      setError(readableError(thrown));
    } finally {
      // Reset in finally so a successful create leaves the row ready for
      // the next add; otherwise saving stays true and the submit guard
      // above would swallow every later create in this column.
      setSaving(false);
    }
  };

  if (!open) {
    return <AddTaskTrigger onOpen={() => setOpen(true)} />;
  }
  return (
    <AddTaskInput
      onSubmit={(event) => void submit(event)}
      onCancel={cancel}
      error={error}
    />
  );
};
