import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ChartEmpty } from './ChartCard'
import { MARK, seriesColor } from './palette'

// Horizontal bars — the default form for "compare magnitude across named
// categories". Horizontal because our categories are long-named (industries,
// people, stages) and horizontal bars give the label a full line to sit on.
//
// One series → one colour for every bar (a value-ramp on nominal categories
// double-encodes length as hue and burns the free channel). Pass `colorFor` to
// override per row — only where the colour *means* something, e.g. status.
//
// Rows: `{ label, count | value, hint?, href? }`.
export function BarChart({
  rows = [],
  color,
  colorFor,
  valueKey = 'count',
  formatValue = (v) => v,
  emptyMessage,
  max: maxOverride,
  className,
}) {
  if (!rows.length) return <ChartEmpty message={emptyMessage} />

  const values = rows.map((r) => Number(r[valueKey]) || 0)
  const max = maxOverride ?? Math.max(1, ...values)
  const barColor = color || seriesColor(0)

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {rows.map((row, i) => {
        const value = Number(row[valueKey]) || 0
        const pct = Math.max(0, Math.min(100, (value / max) * 100))
        const fill = colorFor ? colorFor(row, i) : barColor
        return (
          <Tooltip key={row.key ?? row.label ?? i}>
            <TooltipTrigger asChild>
              {/* The row itself is the hit target, so hovering anywhere on the
                  line works — not just the few pixels the bar occupies. */}
              <div className="grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-3 py-0.5">
                <span className="truncate text-xs text-muted-foreground" title={row.label}>
                  {row.label}
                </span>
                <span
                  className="h-2.5 w-full overflow-hidden rounded-sm"
                  style={{ background: 'var(--chart-track)' }}
                >
                  <span
                    className="block h-full transition-[width] duration-300"
                    style={{
                      width: `${pct}%`,
                      background: fill,
                      // Rounded data-end, square at the baseline.
                      borderRadius: `0 ${MARK.radius}px ${MARK.radius}px 0`,
                    }}
                  />
                </span>
                <span className="w-10 text-right text-xs tabular-nums text-foreground">
                  {formatValue(value)}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {row.label}: {formatValue(value)}
              {row.hint ? ` · ${row.hint}` : ''}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
