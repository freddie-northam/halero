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

export const AddTaskRow = ({ onCreate }: AddTaskRowProps): ReactElement => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    setOpen(false);
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (saving) {
      return;
    }
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") ?? "").trim();
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
      setSaving(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      close();
    }
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-1.5 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" aria-hidden="true" />
        Add task
      </Button>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <Input
        name="title"
        autoFocus
        autoComplete="off"
        placeholder="Task title"
        aria-label="Task title"
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      {error === null ? null : (
        <p className="mt-1.5 text-sm text-destructive">{error}</p>
      )}
    </form>
  );
};
