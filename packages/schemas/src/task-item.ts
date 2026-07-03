import { z } from "zod";

export const TASK_ITEM_KIND = "task.item";

/**
 * The task.item satellite payload at schema version 1: the fields the
 * tasks module stores beside the entity spine. Lives with the kind
 * contract so the host can validate any producer of this kind, even
 * though today only the tasks module's own procedures write it.
 * Expanded additively for the Kanban board (migration 0006); no
 * schemaVersion bump because user-created entities are written through
 * the module's own procedures, not the validating connector path.
 */
export const taskSatelliteSchema = z.object({
  status: z.enum(["todo", "doing", "done"]),
  priority: z.enum(["high", "medium", "low"]).optional(),
  tags: z.array(z.string()).optional(),
  dueDate: z.string().nullable(),
  completedAt: z.number().nullable(),
  notes: z.string().nullable(),
  estimateMinutes: z.number().int().nullable().optional(),
  loggedMinutes: z.number().int(),
});

export type TaskSatellite = z.infer<typeof taskSatelliteSchema>;
