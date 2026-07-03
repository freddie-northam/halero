// A password field with a show/hide eye toggle. Wraps the vendored Input;
// the label doubles as the accessible name (aria-label) and the placeholder,
// so the auth screens read cleanly without separate visible labels.

import { Eye, EyeOff, Input } from "@halero/ui";
import { type ChangeEvent, type ReactElement, useState } from "react";

export interface PasswordInputProps {
  readonly id: string;
  /** Accessible name and placeholder, e.g. "Password". */
  readonly label: string;
  readonly value: string;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly autoComplete: "current-password" | "new-password";
}

export const PasswordInput = ({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: PasswordInputProps): ReactElement => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        aria-label={label}
        placeholder={label}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={onChange}
        className="pr-10"
      />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
};
