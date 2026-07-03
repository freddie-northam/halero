// The shared shell for login and setup: a single centered column. The
// Halero mark sits on top, a one-line subtitle gives context, then the
// form. No panel, no ornament, just the logo and the fields.

import type { ReactElement, ReactNode } from "react";

export interface AuthLayoutProps {
  readonly subtitle: string;
  readonly children: ReactNode;
}

export const AuthLayout = ({
  subtitle,
  children,
}: AuthLayoutProps): ReactElement => (
  <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
    <div className="w-full max-w-[22rem]">
      <img
        src="/brand/halero-mark.png"
        alt="Halero"
        width={195}
        height={189}
        className="mx-auto h-12 w-auto"
      />
      <p className="mt-6 mb-8 text-center text-sm text-muted-foreground">
        {subtitle}
      </p>
      {children}
    </div>
  </div>
);
