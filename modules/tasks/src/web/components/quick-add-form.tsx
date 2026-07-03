// The quick-add row: title, optional due date via the shared DatePicker,
// submit on Enter or the button. The title stays an uncontrolled input
// read through FormData at submit (the app's established form pattern,
// see the Settings forms); the due date is controlled, since DatePicker
// itself is controlled and carries no native form field to read back.
// Validation errors read like sentences, not stack traces.
//
// The title sits on its own row above the date picker and submit button:
// the board's To do column is only ~1/3 of the page width, and a single
// row of title + "Due date" (min-w-36) + "Add" clips the title's
// placeholder there.

import { Button, DatePicker, Input } from "@halero/ui";
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
  const [dueDate, setDueDate] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    if (title === "") {
      setError("A task needs a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate({ title, ...(dueDate === null ? {} : { dueDate }) });
      form.reset();
      setDueDate(null);
    } catch (thrown) {
      setError(readableError(thrown));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="flex flex-col gap-2">
        <Input
          name="title"
          autoComplete="off"
          placeholder="Add a task..."
          aria-label="Task title"
        />
        <div className="flex items-center gap-2">
          <DatePicker
            value={dueDate}
            onChange={setDueDate}
            placeholder="Due date"
            aria-label="Due date"
          />
          <Button type="submit" disabled={saving}>
            Add
          </Button>
        </div>
      </div>
      {error === null ? null : (
        <p className="mt-1.5 text-sm text-destructive">{error}</p>
      )}
    </form>
  );
};
