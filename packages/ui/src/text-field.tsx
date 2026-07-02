import type { InputHTMLAttributes, ReactElement } from "react";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
}

export const TextField = ({
  id,
  label,
  error,
  className = "",
  ...rest
}: TextFieldProps): ReactElement => {
  const errorId = `${id}-error`;
  const borderClass = error === undefined ? "border-border" : "border-red-400";
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-text-muted">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        className={`h-8 rounded-control border bg-surface px-2.5 text-sm text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring ${borderClass} ${className}`.trim()}
        {...rest}
      />
      {error === undefined ? null : (
        <p id={errorId} role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
};
