// The shared shell for the login and setup screens: a two-column split with
// the form on the left and the pixel mosaic filling the right half. The
// brand wordmark and tagline live on the form side so the mosaic stays pure
// art. Every color comes from a theme token, so the whole screen follows the
// brand accent (no hue hardcoded). On mobile the mosaic is hidden and the
// form takes the full width.

import type { ReactElement, ReactNode } from "react";
import { PixelMosaic } from "../components/pixel-mosaic";

export interface AuthLayoutProps {
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
}

export const AuthLayout = ({
  title,
  subtitle,
  children,
}: AuthLayoutProps): ReactElement => (
  <div className="grid min-h-dvh bg-background md:grid-cols-2">
    <div className="flex flex-col justify-center px-6 py-10 md:px-12">
      <div className="mx-auto flex w-full max-w-sm flex-col">
        <div className="mb-12">
          <div className="text-sm font-semibold tracking-tight">Halero</div>
          <div className="text-xs text-muted-foreground">
            The open-source personal OS you host yourself.
          </div>
        </div>
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>
    </div>
    <div className="hidden border-l md:block">
      <PixelMosaic />
    </div>
  </div>
);
