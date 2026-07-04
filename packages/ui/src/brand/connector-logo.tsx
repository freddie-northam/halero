/// <reference path="../assets.d.ts" />
import { Plug } from "lucide-react";

import { cn } from "../lib/utils";
import anthropicUrl from "./assets/anthropic-logo.png";
import appleMusicUrl from "./assets/apple-music-logo.png";
import dropboxUrl from "./assets/dropbox-logo.png";
import f1Url from "./assets/f1-logo.png";
import flightyUrl from "./assets/flighty-logo.png";
import githubUrl from "./assets/github-logo.png";
import googleCalendarUrl from "./assets/google-calendar-logo.png";
import googleDriveUrl from "./assets/google-drive-logo.png";
import obsidianUrl from "./assets/obsidian-logo.png";
import openTableUrl from "./assets/open-table-logo.png";
import openaiUrl from "./assets/openai-logo.png";
import plaudUrl from "./assets/plaud-logo.png";
import revolutUrl from "./assets/revolut-logo.png";
import spotifyUrl from "./assets/spotify-logo.png";
import starlingBankUrl from "./assets/starling-bank-logo.png";
import uberUrl from "./assets/uber-logo.png";
import vintedUrl from "./assets/vinted-logo.png";

// Real brand assets, keyed by the catalog entry's iconId. google-calendar
// and google-drive are DISTINCT logos (do not conflate them). Any iconId
// without an asset falls back to a generic Plug tile.
const LOGO_BY_ID: Record<string, string> = {
  github: githubUrl,
  "google-calendar": googleCalendarUrl,
  "google-drive": googleDriveUrl,
  dropbox: dropboxUrl,
  anthropic: anthropicUrl,
  openai: openaiUrl,
  obsidian: obsidianUrl,
  spotify: spotifyUrl,
  "apple-music": appleMusicUrl,
  flighty: flightyUrl,
  "open-table": openTableUrl,
  plaud: plaudUrl,
  revolut: revolutUrl,
  "starling-bank": starlingBankUrl,
  uber: uberUrl,
  vinted: vintedUrl,
  f1: f1Url,
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
