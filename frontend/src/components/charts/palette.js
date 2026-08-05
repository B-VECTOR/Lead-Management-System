// Chart colour, resolved to design tokens — never to a literal (design.md §2).
//
// Everything here returns a `var(--chart-*)` reference defined in index.css, so
// light/dark swap in one place and no component ever holds a hex. The values
// behind those tokens are validated for the colour-blind separation, lightness
// band and contrast checks documented in design.md §9 — read that before
// changing one.

// Categorical slots, in fixed order. Assign by the entity's position in a
// stable list, never by its current rank: a filter that reorders the rows must
// not repaint them.
export const SERIES = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
]

export const NEUTRAL = 'var(--chart-neutral)'
export const GRID = 'var(--chart-grid)'
export const AXIS = 'var(--chart-axis)'
export const TRACK = 'var(--chart-track)'
export const SURFACE = 'var(--chart-surface)'

// Past the eighth slot we fold into "Other" rather than generate a hue — a
// generated 9th colour is indistinguishable from an existing one under CVD.
export const MAX_SERIES = SERIES.length

export function seriesColor(index) {
  return index < MAX_SERIES ? SERIES[index] : NEUTRAL
}

// The four lead states, matching StatusBadge's families (blue/amber/red/
// emerald) so a chart and the badge beside it always agree.
export const STATUS_COLORS = {
  'In Progress': 'var(--chart-status-progress)',
  Hold: 'var(--chart-status-hold)',
  Dropped: 'var(--chart-status-dropped)',
  Completed: 'var(--chart-status-complete)',
  // Backend task-instance states reuse the same four meanings.
  open: 'var(--chart-status-progress)',
  hold: 'var(--chart-status-hold)',
  dropped: 'var(--chart-status-dropped)',
  closed: 'var(--chart-status-complete)',
  pending: NEUTRAL,
  skipped: NEUTRAL,
}

export function statusColor(status) {
  return STATUS_COLORS[status] || NEUTRAL
}

// Ordinal ramp (one hue, light → dark) for ordered steps — funnel stages, age
// bands. Starts at the blue ramp's step 250: anything lighter drops below 2:1
// against the light surface and disappears.
const ORDINAL = ['#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab']

export function ordinalColor(index, total) {
  if (total <= 1) return ORDINAL[3]
  const step = Math.round((index / (total - 1)) * (ORDINAL.length - 1))
  return ORDINAL[Math.min(ORDINAL.length - 1, Math.max(0, step))]
}

// Shared mark specs, so every chart in the app is built to the same numbers.
export const MARK = {
  barThickness: 24, // cap — never fill the whole band; the leftover is air
  radius: 4, // rounded data-end, square at the baseline
  gap: 2, // surface gap between touching marks
  lineWidth: 2,
  dotRadius: 4,
}
