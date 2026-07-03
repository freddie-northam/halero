import { z } from "zod";

export const TASK_ITEM_KIND = "task.item";

/**
 * The task.item satellite payload at schema version 1: the fields the
 * tasks module stores beside the entity spine. Lives with the kind
 * contract so the host can validate any producer of this kind, even
 * though today only the tasks module's own procedures write it.
 */
export const taskSatelliteSchema = z.object({
  status: z.enum(["open", "done"]),
  dueDate: z.string().nullable(),
  completedAt: z.number().nullable(),
  notes: z.string().nullable(),
});

export type TaskSatellite = z.infer<typeof taskSatelliteSchema>;
