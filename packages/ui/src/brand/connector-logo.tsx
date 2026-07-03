/// <reference path="../assets.d.ts" />
import { Plug } from "lucide-react";

import { cn } from "../lib/utils";
import dropboxUrl from "./assets/dropbox-logo.png";
import googleDriveUrl from "./assets/google-drive-logo.png";

// Real brand assets we ship today. Any iconId outside this map (e.g.
// "github", "google-calendar") falls back to a generic Plug tile until
// its logo is provided.
const LOGO_BY_ID: Record<string, string> = {
  dropbox: dropboxUrl,
  "google-drive": googleDriveUrl,
};

export interface ConnectorLogoProps {
  iconId: string;
  size?: number;
  className?: string;
}

export function ConnectorLogo({
  iconId,
  size = 32,
  className,
}: ConnectorLogoProps) {
  const src = LOGO_BY_ID[iconId];

  if (!src) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-md bg-muted text-muted-foreground",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <Plug style={{ width: size * 0.6, height: size * 0.6 }} />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={cn("rounded-md object-contain", className)}
    />
  );
}
