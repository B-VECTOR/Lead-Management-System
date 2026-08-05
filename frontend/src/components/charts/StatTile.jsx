import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

// A single current value — the right form when the data is one number, and the
// answer to most "should this be a chart?" questions. Contract: label · value ·
// optional hint · optional meter.
//
// The value uses the font's proportional figures on purpose: `tabular-nums`
// gives every digit the width of a zero, which makes a large standalone number
// look loose. Tabular figures are for columns that must align.
export function StatTile({ label, value, hint, icon: Icon, tone, meter, className }) {
  return (
    <Card className={cn('py-0', className)}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p
            className={cn('mt-1 text-2xl font-semibold', tone && 'text-[color:var(--tone)]')}
            style={tone ? { '--tone': tone } : undefined}
          >
            {value}
          </p>
          {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
          {meter}
        </div>
        {Icon && <Icon className="size-7 shrink-0 text-muted-foreground/40" />}
      </CardContent>
    </Card>
  )
}

// A single ratio against a limit. The unfilled track is the same ramp one step
// back, so the state reads across the whole bar rather than only the fill.
export function Meter({ value = 0, max = 100, color, label, className }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={cn('mt-2 flex flex-col gap-1', className)}>
      <span className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--chart-track)' }}>
        <span
          className="block h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, background: color || 'var(--chart-1)' }}
        />
      </span>
      {label && <span className="text-xs tabular-nums text-muted-foreground">{label}</span>}
    </div>
  )
}
