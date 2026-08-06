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
- Card body: `CardContent` default padding; use `p-0` when a card wraps a full-bleed `<Table>` — and also add `py-0` to the outer `<Card>` (it has `py-6` by default), or the table sits inset by that vertical padding anyway.
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
| `<AllocationHealthBadge health title>` | Over/under-allocation verdict (Tech Req §4.7): over→red, under→amber, **`red` (the mandatory Execution Red is empty, labelled "Red required")→amber**, matched→emerald, **`waiting` (the requirement isn't knowable or due yet)→a muted pill naming what it waits for**, nothing to measure→a muted `—`. Reads a `health` object from `allocationHealth(task)` in [lib/allocation.js](frontend/src/lib/allocation.js) — the arithmetic *and the timing* live there, only the colour lives here. Excludes the optional named extras from both sides of the comparison |
| `<SlotBadge slot label released title>` | Resource-allocation slot: execution_red→Red belt color, execution_brown→Brown belt color, white→outlined White, auditor_1–4→indigo, project_member_1–10→neutral. `released` → dashed outline in the same hue (the Potential-belt treatment, read as "no longer held"). Helpers `slotShortLabel(slot)` ("Red"/"A2"/"PM7") and `slotOrder(slot)` (form order: Red, Brown, White, Auditors, Project Members) ship alongside it |

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
| `ModeToggle.jsx` | Light/dark/system theme switcher (icon button + dropdown), backed by `next-themes`'s `ThemeProvider` (wired in `main.jsx`). Lives in `Topbar` next to `NotificationBell` |

Build new cross-page composites here (not inside a page) when a pattern repeats.

### Charts — `src/components/charts/`

The data-viz primitives (R20), all plain SVG/HTML against the chart tokens — **no charting library**. Full rules in §9.

| Component | Purpose |
|---|---|
| `ChartCard` | The frame: title, subtitle, action, legend, and the **table-view toggle** |
| `ChartLegend` | Swatch + label row; renders only for ≥ 2 series |
| `ChartTable` | The table twin every chart ships (`columns` + the same `rows` the chart plotted) |
| `ChartEmpty` | Centered muted empty state, so a chart never draws an axis over nothing |
| `BarChart` | Horizontal bars — the default for "compare magnitude across named categories" |
| `ColumnChart` | Grouped columns over time; measures its container, one y-scale only |
| `DonutChart` | Part-to-whole at a glance, ≤ 6 segments, total in the middle |
| `FunnelChart` | Ordered stage funnel on the ordinal ramp, with per-step drop-off |
| `StatTile` / `Meter` | A single value (label · value · hint · optional meter), and a ratio against a limit |
| `palette.js` | `seriesColor` / `statusColor` / `ordinalColor` / `MARK` — every colour as a token reference |

### Dashboard page furniture — `src/pages/dashboard/shared.jsx`

`DashboardHeader`, `ListCard`, `ListRow`, `ViewAllButton`, `DashboardSkeleton`, `DashboardError`, plus the `num` / `pct` / `days` formatters that render a missing figure as `—`. The five module dashboards are built from these, which is what keeps them one family.

### Lead action buttons — `src/components/leads/`

Lead-level actions that appear on more than one screen are packaged as **self-gating** button+dialog components — `HoldActionButton.jsx`, `ShortCloseButton.jsx`. The pattern:

- The component takes the ids/flags it needs and **renders `null`** when the viewer lacks the role (`PERMISSIONS.*`) or the backend says the action is unavailable. Callers never duplicate the permission check, and a screen can drop the button in unconditionally.
- Confirmation dialog and the mutation live **inside** the component, so every surface gets the identical copy, the same required/optional remark rule, and the same disabled-until-valid Confirm.
- Both halves of the gate are **data from the caller/server**, never inferred from task numbers in the UI.

Reach for this whenever an action outgrows a single page — `ShortCloseButton` renders from both Lead Detail's header and the Resource queue's project group headers.

### Tables

Wrap in a `Card className="py-0"` with `CardContent className="overflow-x-auto p-0"` so wide tables scroll horizontally on mobile without breaking the page, and the card border hugs the table with no extra top/bottom padding. Header cells: `<TableHead>`; use a second header `<TableRow>` for per-column filter inputs (`h-8 text-xs`). Empty/loading state: a single full-`colSpan` `<TableCell className="py-8 text-center text-muted-foreground">`. Clickable rows: `className="cursor-pointer"` + `onClick`; stop propagation on inner links.

**Grouped tables** (several rows belong to one parent — a project's stages, a lead's cycles): state the parent once in a full-`colSpan` header row, `className="bg-muted/40"`, and wrap its contents in a `sticky left-0` div so the parent stays legible while a wide table is scrolled sideways. See `ProjectClosure.jsx` and `MyResourceTasks.jsx`.

#### Paginated tables — filter the dataset, not the page

Any table that can grow without bound gets **server-side** pagination, and its filters must be server-side too (`LeadsList.jsx` + `leads/filters.py`, R25). The rule, because getting it wrong is invisible until the data grows:

- **A page is a page of the *filtered* set.** Filtering happens in the query, before the slice. Filtering rows the client already holds silently hides every match that fell outside the current page — the same screen looks fine on 30 records and lies on 3,000.
- **Filter dropdown options come from the whole dataset, via their own endpoint** (`/api/leads/filter-options/`), never from the loaded rows, and are **not** narrowed by the other active filters. An option that disappears as you filter makes a second filter unusable.
- **Order by a total order.** `-created_at` alone is not one; add the `-id` tie-break or rows repeat and vanish across page boundaries.
- Text filters are **debounced** (300 ms); any filter change **resets to page 1**; a page past the end snaps back to the last real page.
- **Filters + page live in the URL** (`useSearchParams`, `replace: true`). These tables are launch pads for a detail screen, and a filter that dies on every Back trip stops being used.
- Footer: `components/shared/Pagination.jsx` — range ("1–50 of 1,284"), **numbered page buttons**, first/prev/next/last, rows-per-page. Numbered pages because this app's users click a page, not a chevron. Default 50 rows: a dense table should hand over a screenful, not a dozen rows and a click.
- Use `keepPreviousData` so the table holds the old page while the next loads instead of blanking, and dim the body (`opacity-60`) while fetching.

#### Editable table cells

This app's back-office users work in tables, not forms — a screen whose job is "read the row, change one value, act" should put the control **in the cell** rather than behind an expand/modal step. The pattern (`components/resources/AllocationCells.jsx`, R22):

- **The cell is the control.** A `<Select>` with `SelectTrigger className="w-full"`; give the trigger **your own children** instead of `<SelectValue>` so the displayed text comes from the row's own data, not from a matched `<SelectItem>`. **This applies to a picker in a *form* too, not only in a table cell** (R23-2): `<SelectValue>` resolves its text through the option list, so a viewer whose role can't load that list — or whose holder has dropped out of it — sees a **blank control over a value that is actually set**. That was a live bug on the lead's allocation step for three phases. If the row already knows the label, render the label from the row.
- **Never fetch an option list on render.** Load it on first open (`onOpenChange` → a flag → the query's `enabled`); a 20-row table with four picker columns would otherwise fire 80 lookups for lists nobody opened. This is why the displayed text must come from the row.
- **Every change is a save, so every change gets a `toast`.** No per-cell Save button, and no confirm dialog for a reversible, logged change — a confirm restores the click the pattern removes.
- **A missing *required* value is amber** (`text-amber-700 dark:text-amber-400`, §7's under-allocation colour), an optional one stays muted — so scanning a column finds the gaps. **Required but not yet due is muted, not amber** (R24): amber is a claim that something is wrong now, so it must not fire on a row nobody can act on yet — say what it will need and *when* instead ("Not due yet · needs 2"). If a whole family of slots is in that state for most of a record's life, move it behind the row's extras toggle until it is due, rather than leaving a permanently amber column.
- Cells with stacked content get `align-top`; keep explanatory prose out of rows and put it on a tooltip attached to the value it explains.
- Columns are per **role/meaning**, not one per backend key — collapse a rarely-used family into one column, and keep optional extras behind a per-row toggle rather than adding columns nobody reads.

---

## 6. Forms

- Label every field with `<Label>`; required fields get a red asterisk: `<span className="text-red-500">*</span>`.
- Inputs/selects/textareas are the shadcn versions (border `border-input`, `bg-transparent`, focus ring via `ring-ring`).
- **Validation errors reference the field's display label, never the internal field name** (PRD §5.5 rule 6). Show errors with `text-destructive` / `aria-invalid` styling.
- **Dates default to "no past dates allowed"** except fields the PRD explicitly exempts (e.g. Date of Joining) — enforce in both the picker and server-side (CLAUDE.md global rule).
- Multi-step task forms live in `components/leads/` (e.g. `TaskStepFields`, `TaskStepper`) — reuse their field-rendering conventions (`required_when`, conditional show/require). The backend `field_schema` drives them entirely; the renderer covers `text` / `number` / `date` / `boolean` (a Yes-No `Select`) / `choice` (the same `Select`, options supplied by the workflow) / `rowgroup` (repeatable rows). **Add a field type to the schema and the renderer, never a per-task special case in a page.**
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
- **Session timeout warns before it acts** (`components/layout/SessionTimeoutDialog.jsx`, R26). The idle logout is announced by a modal with a live `m:ss` countdown ("Still there?"), never a silent redirect — these screens hold half-filled task fields and allocation forms, so the user gets the chance to keep them. Two buttons only: **Stay signed in** (primary) and **Sign out now** (outline). The one place the app *does* land you somewhere without warning is a session that expired while the tab was closed; there the Login card carries an amber notice saying why (§4 banner recipe), because a bare login form looks like a bug.

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

---

## 9. Data visualization

Charts are read by people, so the colour part is **computed, not eyeballed**. Everything below is implemented in `src/components/charts/` and tokenized in [index.css](frontend/src/index.css).

### The one rule that governs the rest

**Pick the form before the colour.** What is the data's job?

| The data is… | Use | Not |
|---|---|---|
| A single current value | `StatTile` | a one-bar bar chart |
| A handful of headline numbers | a `StatTile` row | a grouped bar chart |
| A ratio against a limit | `Meter` | a 2-slice donut |
| Magnitude across named categories | `BarChart` (horizontal) | a pie |
| Change over time | `ColumnChart` | two y-axes, ever |
| Part-to-whole, ≤ 6 slices, at a glance | `DonutChart` | a donut for comparing close values |
| An ordered sequence (stages, age bands) | `FunnelChart` / the ordinal ramp | categorical hues |
| More than ~8 classes that all carry meaning | `ChartTable` | more colours |

### Colour tokens

Three families, three jobs. **Never a hex in a component** — always `var(--chart-*)` via `palette.js`.

| Family | Token | Job |
|---|---|---|
| Categorical | `--chart-1` … `--chart-8` | **Identity** — industry, domain, slot family. Assigned in fixed slot order, never cycled; a 9th series folds into "Other" |
| Status | `--chart-status-progress` / `-hold` / `-dropped` / `-complete` | **State** — matches the `StatusBadge` families exactly, so a chart and the badge beside it can't disagree |
| Neutral / ordinal | `--chart-neutral`, `ordinalColor()` | De-emphasis grey, and the one-hue light→dark ramp for **ordered** scales |

Chrome: `--chart-grid` (hairline gridlines), `--chart-axis`, `--chart-track` (unfilled bar track), `--chart-surface` (the 2px gap colour between touching marks).

**These values are validated, not chosen.** Both palettes were run against this app's real surfaces (light `#ffffff`, dark `#171717`) for the lightness band, chroma floor, colour-blind separation (adjacent ΔE ≥ 8, OKLab×100) and contrast. The categorical eight pass every gate in both modes. The status quartet passes with **one documented exception**: light-mode `--chart-status-hold` sits at 2.65:1 against white, below the 3:1 bar — allowed *only* because every status chart carries a visible text label and a table view. The obvious Tailwind-500 picks were tried first and failed outright (amber ↔ red measured ΔE 4.4 under deuteranopia). **If you change a chart colour, re-run the validation** rather than judging by eye, and keep the amber↔red pair apart.

### Mark specs (fixed everywhere — `MARK` in `palette.js`)

- Bars **≤ 24px** thick; **4px rounded data-end, square at the baseline**.
- A **2px gap in the surface colour** separates touching marks — stacked segments and adjacent bars alike. Never a border drawn around a mark.
- Gridlines and axes: **solid hairlines**, one step off the surface, recessive. Never dashed.
- Lines 2px; markers ≥ 8px with a 2px surface ring.

### Labels, legend, interaction

- **Text never wears the data colour.** Values, labels and legends use text tokens; a coloured swatch *beside* the text carries identity.
- A **legend is always present for ≥ 2 series**; a single series gets none (the title names it).
- **Label selectively** — never a number on every point. Bars label their tip; the axis, legend and tooltip carry the rest.
- Every chart has a **hover tooltip** and a **table-view twin** (`ChartCard`'s toggle). A tooltip may enhance a value, never gate it.
- Hit targets are the whole row/band, not the mark — a 10px bar is not a hover target.
- Numbers in **columns** get `tabular-nums`; a large standalone figure (a `StatTile` value) does **not** — equal-width digits make it look loose.

### Anti-patterns — if the chart matches one, it's wrong

Dual-axis charts · recolour-on-filter (colour follows the entity, never its rank) · generating a 9th hue · a value-ramp on nominal categories · a rainbow sequential scale · a status colour used for a non-status series · eight hues when the story is one number · a one-bar bar chart · a number on every point · a label clipped by its own bar · a fixed chart height that excludes the x-axis band · skeleton flash on refetch (hold the previous render at reduced opacity instead).
