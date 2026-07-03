// Deterministic presentation for board cards: a tag's color comes from a
// stable hash of its text (same tag, same hue, every render, no server
// round trip), and priority reads through a small fixed palette. Every
// class name below is written out in full (never templated from the hue
// name) so Tailwind's static scanner can see it in this file.

import type { TaskPriority } from "../../contract";

const TAG_ACCENT_CLASSES = [
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-fuchsia-500",
] as const;

const TAG_BADGE_CLASSES = [
  "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
  "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
  "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300",
  "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300",
  "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-300",
] as const;

/** A small stable string hash (djb2 variant); same input, same output. */
const hashTag = (tag: string): number => {
  let hash = 5381;
  for (let index = 0; index < tag.length; index += 1) {
    hash = (hash * 33 + tag.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const tagHueIndex = (tag: string): number =>
  hashTag(tag) % TAG_ACCENT_CLASSES.length;

/** The card's top accent bar, derived from its first tag; none without one.
 * The modulo index is always in range; the fallback only satisfies
 * strict indexed-access typing. */
export const tagAccentClass = (firstTag: string | null): string | null =>
  firstTag === null
    ? null
    : (TAG_ACCENT_CLASSES[tagHueIndex(firstTag)] ?? TAG_ACCENT_CLASSES[0]);

/** A tag chip's colors; the same tag always reads the same hue. */
export const tagBadgeClass = (tag: string): string =>
  TAG_BADGE_CLASSES[tagHueIndex(tag)] ?? TAG_BADGE_CLASSES[0];

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_BADGE_CLASSES: Record<TaskPriority, string> = {
  high: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  medium:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  low: "border-border bg-muted text-muted-foreground",
};

export const priorityLabel = (priority: TaskPriority): string =>
  PRIORITY_LABELS[priority];

export const priorityBadgeClass = (priority: TaskPriority): string =>
  PRIORITY_BADGE_CLASSES[priority];
