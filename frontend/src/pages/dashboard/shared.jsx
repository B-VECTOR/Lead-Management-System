import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// Page furniture shared by the five module dashboards, so they stay visibly
// one family: the same heading rhythm, the same list card, the same skeleton.

export function DashboardHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionTitle({ children, className }) {
  return (
    <h2 className={cn('text-sm font-medium text-muted-foreground', className)}>{children}</h2>
  )
}

// A card wrapping a short list of things to act on. `count` shows how many
// there are when the list itself is capped.
export function ListCard({ title, subtitle, count, action, empty = 'Nothing here. 🎉', children, className }) {
  // Flatten first: a card whose body is several `.map()` calls hands us an
  // array *of arrays*, which is non-empty even when every list inside it is —
  // so the empty state would never show.
  const isEmpty = [children].flat(Infinity).filter((c) => c != null && c !== false).length === 0
  return (
    <Card className={cn('gap-3 py-4', className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            {title}
            {count > 0 && <Badge variant="secondary" className="tabular-nums">{count}</Badge>}
          </CardTitle>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isEmpty ? <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p> : children}
      </CardContent>
    </Card>
  )
}

// One row in a ListCard: a title line, a muted meta line, and a right-hand
// marker (a badge, a count, a ring).
export function ListRow({ to, title, meta, right, className }) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </>
  )
  const classes = cn(
    'flex items-center justify-between gap-3 rounded-md border px-3 py-2',
    to && 'hover:bg-accent',
    className,
  )
  return to ? <Link to={to} className={classes}>{body}</Link> : <div className={classes}>{body}</div>
}

export function ViewAllButton({ to, children }) {
  return (
    <Button asChild variant="outline" size="sm" className="self-start">
      <Link to={to}>{children}</Link>
    </Button>
  )
}

// Loading state. Holds the page's shape rather than collapsing it, so nothing
// jumps when the data lands.
export function DashboardSkeleton({ tiles = 4 }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: tiles }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-64 animate-pulse rounded-lg bg-muted lg:col-span-2" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  )
}

export function DashboardError({ message = 'Could not load this dashboard.' }) {
  return (
    <Card>
      <CardContent className="p-6 text-sm text-muted-foreground">{message}</CardContent>
    </Card>
  )
}

// "—" for a missing number, so an empty dashboard reads as "no data" rather
// than as a real zero.
export function num(value, suffix = '') {
  return value == null ? '—' : `${value}${suffix}`
}

export function pct(value) {
  return value == null ? '—' : `${value}%`
}

export function days(value) {
  if (value == null) return '—'
  return `${value} day${value === 1 ? '' : 's'}`
}
