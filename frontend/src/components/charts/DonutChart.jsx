import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChartEmpty } from './ChartCard'
import { NEUTRAL } from './palette'

// Part-to-whole at a glance, ≤ 6 segments. Not for comparing close values —
// that's a bar chart. The centre carries the total, so the one number the card
// leads with is readable without decoding any arc.
//
// `slices`: `[{ label, value, color }]`.
export function DonutChart({
  slices = [],
  size = 168,
  thickness = 18,
  centerLabel,
  centerValue,
  emptyMessage,
  className,
}) {
  const [hover, setHover] = useState(null)
  const data = slices.filter((s) => Number(s.value) > 0)
  const total = data.reduce((sum, s) => sum + Number(s.value), 0)

  if (!total) return <ChartEmpty message={emptyMessage} />

  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  // A 2px gap in the surface colour separates touching segments — never a
  // stroke drawn around them.
  const gap = data.length > 1 ? 2 : 0

  let offset = 0
  const arcs = data.map((slice) => {
    const fraction = Number(slice.value) / total
    const length = Math.max(0, fraction * circumference - gap)
    const arc = {
      ...slice,
      dasharray: `${length} ${circumference - length}`,
      dashoffset: -offset,
      pct: Math.round(fraction * 100),
    }
    offset += fraction * circumference
    return arc
  })

  const active = hover != null ? arcs[hover] : null

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label="Donut chart">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={NEUTRAL}
            strokeWidth={thickness}
            opacity={0.12}
          />
          {arcs.map((arc, i) => (
            <circle
              key={arc.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={hover === i ? thickness + 4 : thickness}
              strokeDasharray={arc.dasharray}
              strokeDashoffset={arc.dashoffset}
              className="transition-[stroke-width] duration-150"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-semibold">{active ? active.value : centerValue ?? total}</span>
          <span className="max-w-[6rem] truncate text-xs text-muted-foreground">
            {active ? `${active.label} · ${active.pct}%` : centerLabel ?? 'total'}
          </span>
        </div>
      </div>
    </div>
  )
}
