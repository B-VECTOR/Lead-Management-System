import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ChartEmpty } from './ChartCard'
import { GRID, MARK, seriesColor } from './palette'

// Measure the container so the SVG can be drawn in real pixels — a viewBox
// that stretches would distort the axis text with it.
function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

// Round an axis maximum up to a clean number, so ticks read 0 / 5 / 10 rather
// than 0 / 3.5 / 7.
function niceMax(value) {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / magnitude) * magnitude
}

const AXIS_BAND = 22 // reserved for the x labels — the plot never eats into it
const TOP_PAD = 8

// Grouped columns over time. Deliberately **one** y-scale for every series:
// two measures of different magnitude get two charts, never a second axis.
//
// `rows`: `[{ label, <seriesKey>: number, … }]`, oldest first.
// `series`: `[{ key, label, color? }]` — up to four; past that, facet.
export function ColumnChart({
  rows = [],
  series = [],
  height = 180,
  formatValue = (v) => v,
  emptyMessage,
  className,
}) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)

  const hasData = rows.some((row) => series.some((s) => Number(row[s.key]) > 0))
  const plotHeight = height - AXIS_BAND - TOP_PAD

  const max = niceMax(
    Math.max(1, ...rows.flatMap((row) => series.map((s) => Number(row[s.key]) || 0))),
  )
  const bandWidth = width && rows.length ? width / rows.length : 0
  // Cap the bar thickness and let the leftover be air, rather than filling the
  // whole band.
  const groupWidth = Math.max(0, bandWidth - 12)
  const barWidth = series.length
    ? Math.min(MARK.barThickness, (groupWidth - MARK.gap * (series.length - 1)) / series.length)
    : 0

  return (
    <div className={cn('relative', className)} ref={ref}>
      {!hasData && <ChartEmpty message={emptyMessage} />}
      {hasData && width > 0 && (
        <>
          <svg width={width} height={height} role="img" aria-label="Column chart">
            {/* Hairline gridlines, solid, one step off the surface. */}
            {[0, 0.5, 1].map((t) => (
              <line
                key={t}
                x1={0}
                x2={width}
                y1={TOP_PAD + plotHeight * t}
                y2={TOP_PAD + plotHeight * t}
                stroke={GRID}
                strokeWidth={1}
              />
            ))}
            {rows.map((row, i) => {
              const bandX = i * bandWidth
              const groupX = bandX + (bandWidth - barWidth * series.length - MARK.gap * (series.length - 1)) / 2
              return (
                <g key={row.label ?? i}>
                  {/* A full-band hit target: the hover area is the column, not
                      the few pixels of the bar itself. */}
                  <rect
                    x={bandX}
                    y={0}
                    width={bandWidth}
                    height={height}
                    fill="transparent"
                    onMouseEnter={() => setHover({ row, x: bandX + bandWidth / 2 })}
                    onMouseLeave={() => setHover(null)}
                  />
                  {series.map((s, si) => {
                    const value = Number(row[s.key]) || 0
                    const h = (value / max) * plotHeight
                    return (
                      <rect
                        key={s.key}
                        x={groupX + si * (barWidth + MARK.gap)}
                        y={TOP_PAD + plotHeight - h}
                        width={Math.max(0, barWidth)}
                        height={Math.max(0, h)}
                        rx={MARK.radius}
                        fill={s.color || seriesColor(si)}
                        pointerEvents="none"
                      />
                    )
                  })}
                  <text
                    x={bandX + bandWidth / 2}
                    y={height - 6}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px]"
                    pointerEvents="none"
                  >
                    {row.label}
                  </text>
                </g>
              )
            })}
          </svg>
          {hover && (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-sm"
              style={{ left: Math.min(Math.max(hover.x, 48), width - 48) }}
            >
              <div className="font-medium">{hover.row.label}</div>
              {series.map((s) => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: s.color || seriesColor(series.indexOf(s)) }}
                  />
                  {s.label}
                  <span className="ml-auto tabular-nums">{formatValue(hover.row[s.key] ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
