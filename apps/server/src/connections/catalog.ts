// The provider catalog this build ships: every integration the Settings >
// Integrations grid shows, live or coming soon. Live entries (implemented:
// true) are backed by a connector (sync-engine) or an activity source;
// coming_soon entries are placeholders with no consumer yet. The shared
// shape/enums live in @halero/schemas; this is just the list.

import type { ProviderCatalogEntry } from "@halero/schemas";

export const providerCatalog: readonly ProviderCatalogEntry[] = [
  {
    id: "google-calendar",
    displayName: "Google Calendar",
    description:
      "Sync your calendar so events show up on Today and across Halero.",
    category: "calendar",
    iconId: "google-calendar",
    authKind: "oauth2",
    consumer: "sync-engine",
    availability: "available",
    implemented: true,
    featured: true,
  },
  {
    id: "github",
    displayName: "GitHub",
    description:
      "See your pull requests, issues, and contribution activity on the " +
      "Developer page.",
    category: "developer",
    iconId: "github",
    authKind: "apiKey",
    consumer: "activity",
    availability: "available",
    implemented: true,
    featured: true,
  },
  // Local dev-activity sources: no credentials, Halero reads them from disk.
  {
    id: "claude-code",
    displayName: "Claude Code",
    description: "Chart your daily Claude Code sessions in the heatmap.",
    category: "developer",
    iconId: "anthropic",
    authKind: "none",
    consumer: "activity",
    availability: "available",
    implemented: true,
    featured: true,
  },
  {
    id: "codex",
    displayName: "Codex",
    description: "Chart your daily Codex CLI activity in the heatmap.",
    category: "developer",
    iconId: "openai",
    authKind: "none",
    consumer: "activity",
    availability: "available",
    implemented: true,
  },
  {
    id: "wispr-flow",
    displayName: "Wispr Flow",
    description: "Track how much you dictate with Wispr Flow each day.",
    category: "productivity",
    iconId: "wispr-flow",
    authKind: "none",
    consumer: "activity",
    availability: "available",
    implemented: true,
  },
  // Coming soon: showcased with their real logos, no consumer yet.
  comingSoon(
    "obsidian",
    "Obsidian",
    "productivity",
    "none",
    "Bring your Obsidian vault notes into Halero.",
  ),
  comingSoon(
    "plaud",
    "Plaud",
    "ai",
    "oauth2",
    "Import transcripts from your Plaud recorder.",
  ),
  comingSoon(
    "spotify",
    "Spotify",
    "media",
    "oauth2",
    "See your listening activity alongside your day.",
  ),
  comingSoon(
    "apple-music",
    "Apple Music",
    "media",
    "oauth2",
    "Bring your Apple Music listening into Halero.",
  ),
  comingSoon(
    "dropbox",
    "Dropbox",
    "storage",
    "oauth2",
    "Access your Dropbox files from Halero.",
  ),
  comingSoon(
    "google-drive",
    "Google Drive",
    "storage",
    "oauth2",
    "Access your Google Drive documents from Halero.",
  ),
  comingSoon(
    "flighty",
    "Flighty",
    "travel",
    "apiKey",
    "Show upcoming flights on your timeline.",
  ),
  comingSoon(
    "uber",
    "Uber",
    "travel",
    "oauth2",
    "See your trips and receipts in Halero.",
  ),
  comingSoon(
    "open-table",
    "OpenTable",
    "lifestyle",
    "oauth2",
    "Track your restaurant reservations.",
  ),
  comingSoon(
    "vinted",
    "Vinted",
    "lifestyle",
    "oauth2",
    "Follow your Vinted sales and listings.",
  ),
  comingSoon(
    "f1",
    "F1",
    "lifestyle",
    "apiKey",
    "Keep the race calendar next to your own.",
  ),
  comingSoon(
    "revolut",
    "Revolut",
    "finance",
    "oauth2",
    "Bring spending and balances into Halero.",
  ),
  comingSoon(
    "starling-bank",
    "Starling Bank",
    "finance",
    "oauth2",
    "Bring spending and balances into Halero.",
  ),
];

function comingSoon(
  id: string,
  displayName: string,
  category: ProviderCatalogEntry["category"],
  authKind: ProviderCatalogEntry["authKind"],
  description: string,
): ProviderCatalogEntry {
  return {
    id,
    displayName,
    description,
    category,
    iconId: id,
    authKind,
    consumer: null,
    availability: "coming_soon",
    implemented: false,
  };
}

export const getCatalogEntry = (id: string): ProviderCatalogEntry | undefined =>
  providerCatalog.find((entry) => entry.id === id);
