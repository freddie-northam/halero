# Halero

Self-hosted personal dashboard. Bun + Hono + tRPC + SQLite/Drizzle backend;
React 19 + Vite + TanStack Router/Query frontend; shadcn/ui vendored in
`packages/ui`; Biome for lint/format. Modules live in `modules/*` and contribute
nav entries and pages through the web registry; they import only from
`@halero/ui` and `@halero/module-sdk`, never from the app shell.

## Design system

All UI follows `docs/design/design-system.md`. The hard rules, enforced by
`apps/web/src/page-layout-contract.test.ts`:

- Pages never set their own width/padding. The shell wraps every route in
  `PageContainer` (the single width authority). Do not add `mx-auto w-full
  max-w-*` to a page root.
- Every page's first element is a `PageHeader` (title + optional description +
  right-aligned actions slot). It is the only sanctioned page header.
- One coral primary `Button` per page, top-right in the `PageHeader` actions
  slot. Everything else is `outline` / `ghost` / `link`.
- View switchers and filters use `Tabs`. Never hand-roll a segmented control.
- Separation is 1px hairline borders, never shadows. Coral (`--primary`
  #ff5a5f) is the single accent, used sparingly.

Typography, colour, and button roles are tabled in the design-system doc. Never
hand-roll a primitive that `@halero/ui` already provides.
