// The provider catalog: the single source of truth for which integrations
// the Settings > Integrations surface shows, decoupled from whether a live
// connector exists yet. A "coming_soon" entry has no consumer; an
// "available" entry is backed by either the entity-sync engine or an
// activity source. The catalog LIST lives host-side; this file owns only
// the shared shape so the web app can import the types.

import { z } from "zod";

/** How the host authenticates the integration; mirrors the connector auth union. */
export const connectionAuthKindSchema = z.enum(["oauth2", "apiKey", "none"]);
export type ConnectionAuthKind = z.infer<typeof connectionAuthKindSchema>;

/**
 * What a connection feeds. `sync-engine` pulls entities into the spine
 * (Google Calendar); `activity` feeds daily counts to a heatmap (GitHub).
 * Null for coming-soon entries that feed nothing yet.
 */
export const connectionConsumerSchema = z.enum(["sync-engine", "activity"]);
export type ConnectionConsumer = z.infer<typeof connectionConsumerSchema>;

export const providerCategorySchema = z.enum([
  "calendar",
  "developer",
  "communication",
  "storage",
  "productivity",
  "ai",
  "finance",
  "travel",
  "media",
  "lifestyle",
]);
export type ProviderCategory = z.infer<typeof providerCategorySchema>;

export const providerAvailabilitySchema = z.enum(["available", "coming_soon"]);
export type ProviderAvailability = z.infer<typeof providerAvailabilitySchema>;

export const providerCatalogEntrySchema = z.object({
  /** Stable id; matches the connector manifest id when one exists. */
  id: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().min(1),
  category: providerCategorySchema,
  /** Key into the web brand-logo map. */
  iconId: z.string().min(1),
  authKind: connectionAuthKindSchema,
  /** Null when availability is "coming_soon". */
  consumer: connectionConsumerSchema.nullable(),
  availability: providerAvailabilitySchema,
  /**
   * Whether this integration's code is actually wired up. An available
   * entry with implemented=false renders disabled ("live soon") so the
   * grid stays honest during an incremental build.
   */
  implemented: z.boolean(),
  featured: z.boolean().optional(),
});
export type ProviderCatalogEntry = z.infer<typeof providerCatalogEntrySchema>;
