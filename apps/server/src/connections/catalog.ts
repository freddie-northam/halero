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
    description: "Pull your contribution activity into the Progress heatmap.",
    category: "developer",
    iconId: "github",
    authKind: "apiKey",
    consumer: "activity",
    availability: "available",
    implemented: true,
    featured: true,
  },
  // Coming soon: future Progress sources.
  comingSoon(
    "claude-code",
    "Claude Code",
    "developer",
    "none",
    "Chart your Claude Code sessions in the Progress heatmap.",
  ),
  comingSoon(
    "codex",
    "Codex",
    "developer",
    "none",
    "Chart your Codex CLI activity in the Progress heatmap.",
  ),
  comingSoon(
    "wisprflow",
    "Wispr Flow",
    "productivity",
    "none",
    "Track how much you dictate with Wispr Flow.",
  ),
  // Coming soon: productivity apps.
  comingSoon(
    "gmail",
    "Gmail",
    "communication",
    "oauth2",
    "Bring email context into Halero.",
  ),
  comingSoon(
    "slack",
    "Slack",
    "communication",
    "oauth2",
    "Surface Slack conversations and activity in Halero.",
  ),
  comingSoon(
    "notion",
    "Notion",
    "productivity",
    "oauth2",
    "Search Notion pages and docs from Halero.",
  ),
  comingSoon(
    "linear",
    "Linear",
    "developer",
    "oauth2",
    "See your Linear issues and cycles alongside your work.",
  ),
  // Coming soon: storage (logo assets already on hand).
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
