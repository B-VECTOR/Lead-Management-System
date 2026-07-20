# DESIGN.md — LMS Design System

The single source of truth for how the Lead Management System looks and behaves in the UI. **Read this before building or restyling any screen or component.** The goal is one consistent visual language across every page — same colors, same spacing, same component patterns.

> This document describes the system **as actually implemented** in `frontend/`. When you add a pattern, update this file so it stays accurate. If a design need isn't covered here, extend the system deliberately (add a token / shared component) rather than one-off inline styling — and document it.

---

## 1. Foundations

### Stack

| Concern | Choice |
|---|---|
| Styling | Tailwind CSS **v4** (CSS-first config in `src/index.css`, no `tailwind.config.js`) |
| Component base | shadcn/ui — **new-york** style, base color **neutral**, CSS variables on |
| Primitives | Radix UI |
| Icons | **lucide-react** only (size `size-4` default in buttons/nav, `size-3` in badges) |
| Toasts | **sonner** (`toast.success(...)`, `toast.error(...)`) |
| Class merging | `cn()` from `@/lib/utils` (clsx + tailwind-merge) — always use it when composing conditional classes |
| Dark mode | class-based (`.dark`), `next-themes` |

### Golden rules

1. **Never hardcode a hex/oklch color in a component.** Use a semantic token (`bg-background`, `text-muted-foreground`, `border-border`, …) or, for status/domain meaning, the `<StatusBadge>` family (§4).
2. **Never invent a new status color inline.** All status/priority/role/belt/type coloring goes through `src/components/shared/StatusBadge.jsx`. If a status is missing, add it there.
3. **Every screen is mobile-responsive** — a hard requirement, not an afterthought (per CLAUDE.md). Design mobile-first; use `sm:` / `lg:` to scale up.
4. **Use existing shadcn/ui components** from `src/components/ui/` before writing new markup. Use the shared composites in `src/components/shared/` before reinventing them.
5. **Both light and dark must work.** Every status style already ships a `dark:` variant — follow that pattern for anything new.

---

## 2. Color tokens

Defined as CSS variables in [index.css](frontend/src/index.css) and exposed to Tailwind via `@theme inline`. Use the Tailwind utility (right column), never the raw variable.

### Semantic (theme-aware — always prefer these)

| Token | Utility examples | Use for |
|---|---|---|
| `background` / `foreground` | `bg-background` `text-foreground` | Page base surface & default text |
| `card` / `card-foreground` | `bg-card` | Card surfaces |
| `popover` / `popover-foreground` | `bg-popover` | Dropdowns, popovers, select menus |
| `primary` / `primary-foreground` | `bg-primary text-primary-foreground` | Primary buttons, active nav item |
| `secondary` / `secondary-foreground` | `bg-secondary` | Secondary buttons, subtle fills |
| `muted` / `muted-foreground` | `bg-muted` `text-muted-foreground` | Muted surfaces, secondary/label text, placeholders, empty states |
| `accent` / `accent-foreground` | `hover:bg-accent` | Hover states for nav/menu items |
| `destructive` | `bg-destructive` `text-destructive` | Delete/danger actions & validation errors |
| `border` | `border-border` | All borders & dividers |
| `input` | `border-input` | Form field borders |
| `ring` | `ring-ring` | Focus rings (`focus-visible:ring-[3px] ring-ring/50`) |
| `success` | `text-success` | Positive semantic accent (defined; prefer emerald status styles for badges) |
| `warning` | `text-warning` | Caution semantic accent |

The base palette is neutral/grayscale (`oklch(… 0 0)`), so **color in the UI comes almost entirely from status badges** — this keeps chrome calm and makes meaningful color pop.

### Radius

`--radius: 0.625rem` (10px). Use `rounded-md` (buttons, inputs, cards inner), `rounded-lg` (cards), `rounded-full` (badges/pills, avatars, progress bars). Tokens: `radius-sm/md/lg/xl` derive from `--radius`.

---

## 3. Typography, spacing, layout

### Type scale

- Body default: `text-sm` for most UI; `text-base` on inputs (shrinks to `md:text-sm`).
- Labels / secondary: `text-xs text-muted-foreground`.
- Badges: `text-xs font-medium`.
- Numeric columns (IDs, counts, %, currency): add `tabular-nums`.
- Weights: `font-medium` for emphasis/labels/nav, `font-semibold` sparingly for headings/values. Avoid `font-bold`.

### Spacing

- Page content padding: `p-4 sm:p-6` (set by `AppShell` main). Don't re-pad the page root.
- Card body: `CardContent` default padding; use `p-0` when a card wraps a full-bleed `<Table>`.
- Gaps: `gap-2` (tight, inline), `gap-2.5` (nav items), `gap-4`/`gap-6` (section stacks). Vertical rhythm via `space-y-4` / `space-y-6`.

### App layout

Defined in [AppShell.jsx](frontend/src/components/layout/AppShell.jsx):

```
┌───────────────────────────────────────────┐
│ Sidebar │ Topbar                           │
│ (w-60,  │──────────────────────────────────│
│  w-16   │ <main> p-4 sm:p-6                 │
│  collapsed) │  overflow-y-auto  <Outlet/>   │
│  lg:flex │                                  │
└───────────────────────────────────────────┘
```

- Full-height shell: `h-svh`, `overflow-hidden`; only `<main>` scrolls.
- Sidebar hidden below `lg` (mobile uses a Sheet/drawer). Collapsible between `w-60` and `w-16`; collapsed items show a right-side `Tooltip`.
- App background is `bg-muted/30`; content surfaces (cards) sit on top in `bg-card`/`bg-background`.
- **Active nav item:** `bg-primary text-primary-foreground`; inactive: `text-muted-foreground hover:bg-accent hover:text-accent-foreground`.

### Page header pattern

Each page starts with a title row (title + optional actions/search on the right), then content. Keep titles concise; primary action button sits top-right.

---

## 4. Status & semantic badges — the color system

**All meaning-bearing color lives in [StatusBadge.jsx](frontend/src/components/shared/StatusBadge.jsx).** Import the right component; do not hand-roll pills. Every style has a `dark:` variant. The base pill: `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium`.

### Color-to-meaning convention

| Meaning | Light family | Read as |
|---|---|---|
| Neutral / not started / N/A | `slate` / `neutral` | Inactive, idle |
| Active / in progress / info | `blue` | Working, current |
| Success / complete / freed | `emerald` | Done, good |
| Paused / caution / high | `amber` | On hold, attention |
| Danger / dropped / urgent | `red` | Stopped, error |
| Special categories | `purple` `violet` `cyan` `orange` `pink` `rose` | Types, roles (identity, not state) |

Keep this mapping stable — blue never means "done", emerald never means "error".

### Exported badge components

| Component | Values → color |
|---|---|
| `<LeadStatusBadge status>` | In Progress→blue, On Hold→amber, Dropped→red, Hybernation→purple, Complete/Completed→emerald |
| `<TaskStatusBadge status>` | Not started→slate, In progress→blue, Completed→emerald |
| `<TaskStateBadge status>` | pending→slate, open→blue, hold→amber, closed→emerald, skipped→neutral+`line-through`, dropped→red *(backend task-instance statuses)* |
| `<ChecklistStatusBadge status>` | open→slate, in_progress→blue, done→emerald, na→neutral |
| `<ChecklistItemBadge status>` | not_started→slate, inprogress→blue, complete→emerald |
| `<PriorityBadge priority>` | Low→neutral, Medium→blue, High→amber, Urgent→red |
| `<LeadTypeBadge type>` | BD→violet, Mining→cyan, Extension→orange |
| `<RoleBadge role>` | User Management→rose, Lead Admin→violet, Lead Manager→blue, Marketing→pink, Resource Manager→cyan, Finance→emerald, Employee→neutral |
| `<BeltBadge belt>` | Solid: Black→neutral-900, Brown→amber-800, Red→red-600, White→outlined. `Potential X`→dashed outline in X's color. NA→neutral |

> **Tracker/progress bars follow lead status** (see `STATUS_BAR_COLORS` in [LeadsList.jsx](frontend/src/pages/LeadsList.jsx)): emerald while moving/done, amber when paused, red when dropped. The generic `<ProgressBar>`/`<ProgressRing>` use emerald (100%) / blue (in progress) / neutral (0%).

### Inline status blocks (banners)

Info/hold banners on Lead & Task detail use the same families as **soft-tinted blocks**, e.g. amber hold banner:
`rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200`
Drop banner uses the red family. Follow this border-300 / bg-50 / text-900 (+ dark 900/950/200) recipe for any new tinted callout.

---

## 5. Component library

### shadcn/ui primitives — `src/components/ui/`

Available and in use: `button`, `input`, `textarea`, `select`, `checkbox`, `label`, `badge`, `card`, `table`, `tabs`, `dialog`, `sheet`, `dropdown-menu`, `popover`, `tooltip`, `command`, `avatar`, `separator`, `progress`, `sonner`. Add new shadcn components via the CLU into this folder; don't copy-paste ad hoc.

**Button** ([button.jsx](frontend/src/components/ui/button.jsx)) — variants: `default` (primary), `destructive`, `outline`, `secondary`, `ghost`, `link`. Sizes: `default` (h-9), `xs` (h-6), `sm` (h-8), `lg` (h-10), and icon sizes `icon` / `icon-xs` / `icon-sm` / `icon-lg`. Buttons auto-size leading icons and gap them.

**Badge** ([badge.jsx](frontend/src/components/ui/badge.jsx)) — the generic shadcn badge (`default`/`secondary`/`destructive`/`outline`/`ghost`/`link`). Use this only for non-status labels; for anything with domain meaning use the `StatusBadge` family (§4).

### Shared composites — `src/components/shared/`

| Component | Purpose |
|---|---|
| `StatusBadge.jsx` | All status/priority/role/belt/type pills (§4) |
| `ProgressBar.jsx` | Horizontal progress for dense contexts (table rows). `min-w-[110px]`, 2px track, `%` label |
| `ProgressRing.jsx` | Circular progress for cards/detail (default 40px). Same color logic as bar |
| `UserChip.jsx` | Avatar (initials) + name. `size="sm"` (size-6) or larger. Falls back to muted "Unassigned" |

Build new cross-page composites here (not inside a page) when a pattern repeats.

### Tables

Wrap in a `Card` with `CardContent className="overflow-x-auto p-0"` so wide tables scroll horizontally on mobile without breaking the page. Header cells: `<TableHead>`; use a second header `<TableRow>` for per-column filter inputs (`h-8 text-xs`). Empty/loading state: a single full-`colSpan` `<TableCell className="py-8 text-center text-muted-foreground">`. Clickable rows: `className="cursor-pointer"` + `onClick`; stop propagation on inner links.

---

## 6. Forms

- Label every field with `<Label>`; required fields get a red asterisk: `<span className="text-red-500">*</span>`.
- Inputs/selects/textareas are the shadcn versions (border `border-input`, `bg-transparent`, focus ring via `ring-ring`).
- **Validation errors reference the field's display label, never the internal field name** (PRD §5.5 rule 6). Show errors with `text-destructive` / `aria-invalid` styling.
- **Dates default to "no past dates allowed"** except fields the PRD explicitly exempts (e.g. Date of Joining) — enforce in both the picker and server-side (CLAUDE.md global rule).
- Multi-step task forms live in `components/leads/` (e.g. `TaskStepFields`, `TaskStepper`) — reuse their field-rendering conventions (`required_when`, conditional show/require).
- Success feedback via `toast.success(...)`; keep messages short and specific ("Task reassigned", "Follow-up created").

### Formatting helpers — `src/lib/format.js`

Always format through these for consistency: `formatCurrency`, `formatCompactCurrency`, `formatDate` (e.g. "Jul 20, 2026"), `formatDateTime`, `formatRelativeDue` ("Due in 3 days" / "Overdue by 2 days"), `isOverdue`, `initials`. Null values render as `—`.

---

## 7. Interaction & feedback conventions

- **Empty / loading / no-results:** centered `text-muted-foreground` message (`py-8` in tables).
- **Overdue / warning inline flags:** amber tint (see §4 banner recipe); over-allocation uses `text-red-600`, under-allocation amber.
- **Destructive actions:** `destructive` button variant + confirmation dialog (`dialog`/`sheet`). Never delete without confirm.
- **Focus:** rely on the built-in `focus-visible:ring-[3px] ring-ring/50` — don't remove focus rings.
- **Transitions:** subtle only (`transition-colors`, `transition-[width] duration-200`). No large motion.
- **Tooltips** for icon-only controls (e.g. collapsed sidebar).

---

## 8. Checklist before shipping a screen

- [ ] Uses semantic tokens / `StatusBadge` — zero hardcoded colors, zero new inline status colors.
- [ ] Reuses `ui/` primitives and `shared/` composites where they fit.
- [ ] Works at mobile width (`sm`) and up; wide tables scroll inside their card.
- [ ] Light **and** dark verified.
- [ ] Required fields marked; validation errors use display labels; no past dates unless exempt.
- [ ] Numbers use `tabular-nums`; dates/currency go through `lib/format.js`.
- [ ] Nulls render `—`; loading/empty states present.
- [ ] Any new reusable pattern added to `shared/` **and** documented here.
