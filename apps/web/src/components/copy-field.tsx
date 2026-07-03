import { Button } from "@halero/ui";
import { type ReactElement, useState } from "react";

/** A monospace value with a one-click Copy affordance. */
export const CopyField = ({
  value,
}: {
  readonly value: string;
}): ReactElement => {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    const clipboard: Clipboard | undefined = navigator.clipboard;
    if (clipboard === undefined) {
      return;
    }
    void clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <span className="mt-2 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 text-xs">
        {value}
      </code>
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </span>
  );
};
