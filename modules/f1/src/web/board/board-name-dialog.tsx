// A small controlled dialog for naming a board, shared by the create and
// rename controls. It owns its own input and error state, validates a
// non-blank name the same way the server does, and closes on success.

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from "@halero/ui";
import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import { readableError } from "../readable-error";

export interface BoardNameDialogProps {
  readonly title: string;
  readonly submitLabel: string;
  readonly initialName?: string;
  readonly trigger: ReactNode;
  readonly onSubmit: (name: string) => Promise<void>;
}

export const BoardNameDialog = ({
  title,
  submitLabel,
  initialName = "",
  trigger,
  onSubmit,
}: BoardNameDialogProps): ReactElement => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset to the current name each time the dialog opens, so a cancelled
  // edit never leaks into the next one.
  useEffect(() => {
    if (open) {
      setName(initialName);
      setError(null);
    }
  }, [open, initialName]);

  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("A board needs a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setOpen(false);
    } catch (thrown) {
      setError(readableError(thrown));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          autoFocus
          aria-label="Board name"
          placeholder="Board name"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {error === null ? null : (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => void submit()}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
