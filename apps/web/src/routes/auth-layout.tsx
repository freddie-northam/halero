// The shared shell for login and setup: a two-column split with the form on
// the left and the signature panel filling the right half. The left column
// is a deliberate three-part composition (logo pinned top, form centered,
// tagline pinned bottom), left-aligned and capped so it reads as considered,
// not floating. Every color comes from a theme token, so the whole screen
// follows the brand accent. On mobile the panel is hidden and the form takes
// the full width.

import "./auth-layout.css";

import type { ReactElement, ReactNode } from "react";
import { SignaturePanel } from "../components/signature-panel";

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
    <div className="flex min-h-dvh flex-col px-8 py-10 md:pl-20 md:pr-12">
      <img
        src="/brand/halero-logo.png"
        alt="Halero"
        width={753}
        height={189}
        className="h-7 w-auto self-start"
      />
      <div className="auth-enter flex w-full max-w-[26rem] flex-1 flex-col justify-center py-12">
        <h1 className="text-[2rem] font-bold leading-[1.1] tracking-tight md:text-[2.5rem]">
          {title}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>
      <p className="text-xs text-muted-foreground">
        The open-source personal OS you host yourself.
      </p>
    </div>
    <div className="hidden md:block md:border-l">
      <SignaturePanel />
    </div>
  </div>
);
