# Halero design system

The canonical design language every page builds on. It is codified in tokens
(`packages/ui/src/theme.css`), enforced structurally by two primitives
(`PageContainer`, `PageHeader` in `@halero/ui`), and checked in CI by
`apps/web/src/page-layout-contract.test.ts`. Read this before adding a page or a
control.

## The hard rules (enforced)

1. Pages never set their own width or padding. The shell wraps every route in
   `PageContainer` (the single width authority); a page that hand-rolls
   `mx-auto w-full max-w-*` fails the layout guard test.
2. Every page's first element is a `PageHeader` (title, optional description, a
   right-aligned actions slot). It is the only sanctioned page header.
3. One coral primary action per page, top-right in the `PageHeader` actions
   slot. Everything else is `outline` / `ghost` / `link`.
4. View switchers and filters use `Tabs`. Never hand-roll a segmented control.
5. Separation comes from 1px hairline borders, never shadows.

## Foundations (tokens)

- **Typeface**: Inter Variable, one family for everything. Weight and size carry
  hierarchy, not extra families. Use the `tnum` utility for figures and dates.
- **Type scale** (dense, capped at 24px): `text-xs` 12/16, `text-sm` 13/20,
  `text-base` 15/22, `text-lg` 18/26, `text-xl` 24/32. Body is 13px (`text-sm`).
- **Weights**: 400 normal (body), 500 medium (labels, buttons, active nav), 600
  semibold (titles). Avoid 700.
- **Radius**: 6px for controls (`rounded-md`), 10px for panels and cards
  (`rounded-xl`).

## Typography roles

| Role | Recipe | Size/line | Weight | Colour | Used for |
|---|---|---|---|---|---|
| Page title | `text-lg font-semibold tracking-tight` | 18/26 | 600 | `foreground` | the one title per page (via `PageHeader`) |
| Page subtitle | `text-sm text-muted-foreground` | 13/20 | 400 | `muted-foreground` | optional line under the title |
| Section title | `text-sm font-semibold tracking-tight` | 13/20 | 600 | `foreground` | card and section headers |
| Body | `text-sm` | 13/20 | 400 | `foreground` | default content |
| Secondary / muted | `text-sm text-muted-foreground` | 13/20 | 400 | `muted-foreground` | descriptions, hints, empty states |
| Label | `text-sm font-medium` | 13/20 | 500 | `foreground` | field labels, active nav label |
| Caption / meta | `text-xs text-muted-foreground` | 12/16 | 400 | `muted-foreground` | timestamps, counts, `kbd`, helper text |
| Numeric emphasis | `text-base tnum` | 15/22 | 500-600 | `foreground` | standout figures |
| Sidebar nav | `text-[15px]` | 15 | 400 (500 active) | `foreground` | sidebar chrome (roomier than content) |

One 18px page title per page. Never two competing headline sizes. Drop to 12px
only for true meta.

## Colour roles

| Role | Token | Hex | Usage |
|---|---|---|---|
| App frame + sidebar | `--sidebar` | #efece7 | warm frame and sidebar surface |
| Content panel + cards | `--card` | #ffffff | the floating page panel and every card |
| Base background | `--background` | #fafaf9 | auth/login backdrop only |
| Muted surface | `--muted` / `--secondary` / `--accent` | #f5f5f4 | tab tracks, hover fills, subtle chips |
| Primary text | `--foreground` | #1c1917 | titles, body |
| Secondary text | `--muted-foreground` | #78716c | descriptions, meta, placeholders |
| Brand accent | `--primary` | #ff5a5f | primary buttons, active-nav tint + icon, focus ring, primary links |
| On-accent | `--primary-foreground` | #ffffff | text/icon on coral |
| Hairline border | `--border` / `--input` | #e7e5e4 | borders, dividers |
| Destructive | `--destructive` | #dc2626 | errors, overdue dates, destructive actions |
| Focus ring | `--ring` | #ff5a5f | focus-visible rings |

Coral is the single accent, used sparingly (one primary action, active nav,
focus). The warm frame vs white panel is the only surface contrast that carries
the floating-panel look.

## Buttons (`Button` from `@halero/ui`)

| Role | `variant` | `size` | Where |
|---|---|---|---|
| Primary / create | `default` (coral) | `default` (h-8) | one per page, top-right in `PageHeader` |
| Secondary | `outline` | `sm` / `default` | toolbars (Refresh, date-nav "Today") |
| Tertiary / subtle | `ghost` | `sm` | contextual ("+ Add task"), menu items |
| Destructive | `destructive` | `default` | confirmed deletes |
| Low-stakes destructive | `outline` | `default` | Sign out |
| Icon | `outline` / `ghost` | `icon` / `icon-xs` | prev/next, close |
| Inline link CTA | `link` (or styled `Link`) | - | actions inside prose |

There is no separate "primary" variant: `default` is the coral fill. Exactly one
coral button per page. Buttons default to `type="button"`.

## Controls

- **View switch / filter**: `Tabs` only. `TabsList` is a `bg-muted` track; the
  active trigger is a white `bg-background` pill, inactive is
  `text-muted-foreground`.
- **Inputs**: `Input` (rounded-md, `border-input`, 13px, placeholder
  `muted-foreground`, coral focus ring).
- **Badge / Checkbox / Alert**: use the `@halero/ui` components. `Badge` for
  counts; `Alert variant="destructive"` for errors.
- **Links**: in-prose CTA is `text-foreground underline underline-offset-4
  hover:text-primary`; a secondary nav link (for example "Open calendar") is
  `text-sm text-muted-foreground hover:text-foreground` with no underline.

## Spacing, rhythm, icons

- Page padding `px-6 py-8` (owned by `PageContainer`). Title to body `mt-6`.
  Between sections `gap-6` / `gap-8`. Card interior `p-4`. Control clusters
  `gap-2`.
- Icons: lucide only, from the sanctioned export list in
  `packages/ui/src/index.ts`. `size-4` in buttons and inline, `size-5` in the
  sidebar nav.

## Building a page

```tsx
import { PageHeader, Button } from "@halero/ui";

export const ThingScreen = () => (
  <>
    <PageHeader title="Thing" description="Optional subtitle.">
      <Button type="button" onClick={onCreate}>New thing</Button>
    </PageHeader>
    <div className="mt-6">{/* body */}</div>
  </>
);
```

No width wrapper, no hand-rolled header. The shell frames it. Detail/editor
surfaces that need a narrower reading column (for example the note editor) are
the only exception and are listed in the layout guard test's exemptions.
