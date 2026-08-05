import { useId, useState } from 'react'
import { Table2, ChartColumn } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// The frame every chart sits in: title, optional subtitle and action, the
// legend, and the **table view toggle**.
//
// The table view is not decoration — it is how a value stays reachable when
// colour or a hover tooltip isn't (design.md §9). Any chart with a `table`
// prop renders the toggle; charts pass their own rows so the twin shows the
// same numbers, not an approximation of them.
export function ChartCard({
  title,
  subtitle,
  action,
  legend,
  table,
  className,
  bodyClassName,
  children,
}) {
  const [showTable, setShowTable] = useState(false)
  const id = useId()

  return (
    <Card className={cn('gap-3 py-4', className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          {table && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-pressed={showTable}
                  aria-controls={id}
                  onClick={() => setShowTable((v) => !v)}
                >
                  {showTable ? <ChartColumn /> : <Table2 />}
                  <span className="sr-only">{showTable ? 'Show chart' : 'Show table'}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{showTable ? 'Show chart' : 'Show as table'}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </CardHeader>
      <CardContent id={id} className={cn('flex flex-col gap-3', bodyClassName)}>
        {showTable && table ? table : children}
        {!showTable && legend}
      </CardContent>
    </Card>
  )
}

// A legend is always present for two or more series — identity must never rest
// on colour-matching alone. One series needs none: the title already names it.
export function ChartLegend({ items, className }) {
  if (!items?.length || items.length < 2) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: item.color }}
          />
          {item.label}
          {item.value != null && (
            <span className="tabular-nums text-foreground">{item.value}</span>
          )}
        </span>
      ))}
    </div>
  )
}

// The table twin. Columns are `{ key, label, align, render }`; `rows` are the
// same objects the chart plotted.
export function ChartTable({ columns, rows, emptyMessage = 'No data yet.' }) {
  if (!rows?.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
  }
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn('px-2 py-1.5 font-medium', col.align === 'right' ? 'text-right' : 'text-left')}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.key ?? row.label ?? i} className="border-b last:border-0">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-2 py-1.5',
                    col.align === 'right' && 'text-right tabular-nums',
                  )}
                >
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Empty state, so a chart never renders an axis with nothing on it.
export function ChartEmpty({ message = 'Nothing to show yet.' }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{message}</p>
}
