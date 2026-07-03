// The quick-add row: title, optional due date via the native date input
// (the sanctioned v0.2 choice; no custom picker), submit on Enter or the
// button. Uncontrolled inputs read through FormData at submit, the
// app's established form pattern (see the Settings forms); validation
// errors read like sentences, not stack traces.

import { Button, Input } from "@halero/ui";
import { type FormEvent, type ReactElement, useState } from "react";
import { readableError } from "../readable-error";

export interface QuickAddFormProps {
  readonly onCreate: (input: {
    readonly title: string;
    readonly dueDate?: string;
  }) => Promise<void>;
}

export const QuickAddForm = ({ onCreate }: QuickAddFormProps): ReactElement => {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const dueDate = String(data.get("dueDate") ?? "");
    if (title === "") {
      setError("A task needs a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate({ title, ...(dueDate === "" ? {} : { dueDate }) });
      form.reset();
    } catch (thrown) {
      setError(readableError(thrown));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="flex items-center gap-2">
        <Input
          name="title"
          autoComplete="off"
          placeholder="Add a task..."
          aria-label="Task title"
        />
        <Input
          name="dueDate"
          type="date"
          aria-label="Due date"
          className="w-36 shrink-0"
        />
        <Button type="submit" disabled={saving}>
          Add
        </Button>
      </div>
      {error === null ? null : (
        <p className="mt-1.5 text-sm text-destructive">{error}</p>
      )}
    </form>
  );
};
