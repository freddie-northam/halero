import type { ReactElement } from "react";

export interface SpinnerProps {
  readonly className?: string;
}

export const Spinner = ({ className = "" }: SpinnerProps): ReactElement => (
  <span
    aria-hidden="true"
    className={`inline-block size-4 animate-spin rounded-full border-2 border-border border-t-accent ${className}`.trim()}
  />
);
