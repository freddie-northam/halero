# Design: Tasks Kanban board + shared date picker (v0.3)

Approved 2026-07-03. Reshapes the Tasks module from a flat list into a
Kanban board, and introduces one shared date-picker component used
everywhere a date is chosen.

## Decisions

- **Workflow**: three statuses, `todo` / `doing` / `done`. Migrate existing
  `open -> todo`, `done -> done`. `completed_at` is set when a task enters
  `done`, cleared when it leaves.
- **Card fields**: tags (colored chips), priority (high/medium/low),
  due date (with overdue tint), notes snippet, and time (estimate +
  running logged total). Assignees/comments/share from the reference are
  dropped: this is a single-user personal OS.
- **Views**: Board (default) and List, via a Tabs + URL-param switcher
  mirroring the Calendar module (`/tasks?view=board|list`). Both read the
  same data.
- **Date picking**: vendor the shadcn Calendar (react-day-picker) plus a
  Popover into `packages/ui`, themed to the Halero palette and matching the
  month grid (Monday-start, accent today ring, muted out-of-range). One
  `DatePicker` replaces the native `<input type="date">` and becomes the
  canonical date picker. The big Calendar month/week views keep their own
  components (they render event chips) but share the day-cell styling.
- **Drag and drop**: `@dnd-kit` (accessible React DnD; shadcn ships none).
  Drag between columns changes status; drag within reorders via
  `sort_order`.

## Data model (migration 0006)

Extend the `tasks` satellite:

- `status`: CHECK moves to `('todo','doing','done')`.
- `priority` TEXT NULL CHECK in `('high','medium','low')`.
- `tags` TEXT NULL (JSON string array).
- `estimate_minutes` INTEGER NULL.
- `logged_minutes` INTEGER NOT NULL DEFAULT 0.
- `sort_order` REAL NOT NULL DEFAULT 0 (position within a column).

Existing rows: `status` remapped, new columns take defaults/NULL. Tags are
mirrored into the spine `snippet` so they are searchable. The `task.item`
kind schema (`@halero/schemas`) gains the new optional fields; no
schemaVersion bump is needed because user-created entities are written via
`createUserEntity` + the module's own satellite insert, not the connector
sync path that validates against the kind schema.

## Server (tasks router)

- `board()`: all live tasks grouped by status, ordered by `sort_order` then
  `created_at`.
- `list({ filter })`: keep the existing list, filters adapted (`todo`,
  `doing`, `done`, `active` = todo+doing, `all`).
- `create` / `update`: accept `priority`, `tags`, `estimate_minutes`,
  `dueDate` (mirroring due date into the spine `occurred_start` as today).
- `move({ entityId, status, sortOrder })`: reposition and/or restatus in one
  transaction; sets/clears `completed_at` on the done boundary.
- `logTime({ entityId, minutes })`: adds to `logged_minutes`.
- `today()`: overdue/due-today over non-done tasks, unchanged semantics.
- Semantic guards (task-satellite join, connector-source 403, tombstone 404)
  preserved from v0.2.

## Web

- `packages/ui`: vendor `calendar.tsx` (react-day-picker), `popover.tsx`
  (radix monopackage), and a `date-picker.tsx` composite; named exports.
- `modules/tasks/src/web`: BoardView (columns + dnd + cards + add-task),
  ListView (current, restatused), a view switcher, a TaskDetail sheet
  (edit title/notes/tags/priority/due/estimate), and the quick-add using the
  shared DatePicker. Overdue tint still derives from the server `today`
  value (no client timezone math). Query keys stay module-private; the
  registry-wrapped api invalidates after mutations.
- Today "Due today" section and the entity link stay working.

## Phasing

1. Board core: migration 0006, server board/move/list, shared DatePicker,
   BoardView + ListView + switcher + TaskDetail, priority + tags + notes +
   due date. Matches the reference visually.
2. Time: estimate + logged total UI and the `logTime` action.

## Testing

Per-task: `bun test` green, biome exit 0 (checked directly), typecheck,
web build. Live: a `/qa` pass driving drag between columns, tag/priority
edit, the date picker, and the view switcher, plus a fresh-instance
migration check that 0006 remaps existing statuses. Never exact-match
`Intl.DateTimeFormat` output in tests (comma varies by ICU build).
