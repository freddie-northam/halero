import { z } from "zod";

export const NOTE_ITEM_KIND = "note.item";

/**
 * The note.item satellite payload at schema version 1: the fields the
 * notes module stores beside the entity spine. The block document is an
 * opaque array of BlockNote blocks: the host validates only that it is a
 * block array, never the block internals, so the editor can evolve its
 * block shapes without a schema change here. The searchable plaintext
 * lives on the spine (entities.snippet), not in this satellite. As with
 * task.item, no schemaVersion bump is needed when fields are added, since
 * user-created notes are written through the module's own procedures, not
 * the validating connector path.
 */
export const noteSatelliteSchema = z.object({
  document: z.array(z.unknown()),
  tags: z.array(z.string()).optional(),
});

export type NoteSatellite = z.infer<typeof noteSatelliteSchema>;
