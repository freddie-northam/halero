import type { ReactElement, ReactNode } from "react";

export interface FormErrorProps {
  readonly children: ReactNode;
}

export const FormError = ({ children }: FormErrorProps): ReactElement => (
  <div
    role="alert"
    className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
  >
    {children}
  </div>
);
