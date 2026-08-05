import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ChartEmpty } from './ChartCard'
import { ordinalColor } from './palette'

// Stage funnel — an *ordered* scale, so it takes the one-hue ordinal ramp
// rather than categorical slots: the steps have a natural sequence and the ramp
// says so. Each step shows how much of the previous step survived, which is the
// number a funnel is actually read for.
//
// `steps`: `[{ label, count, from_previous }]`, in order.
export function FunnelChart({ steps = [], emptyMessage, className }) {
  const max = Math.max(1, ...steps.map((s) => s.count || 0))
  if (!steps.some((s) => s.count > 0)) return <ChartEmpty message={emptyMessage} />

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {steps.map((step, i) => {
        const pct = ((step.count || 0) / max) * 100
        return (
          <Tooltip key={step.code ?? step.label}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{step.label}</span>
                <span className="relative h-6 flex-1 overflow-hidden rounded-sm" style={{ background: 'var(--chart-track)' }}>
                  <span
                    className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-300"
                    style={{ width: `${pct}%`, background: ordinalColor(i, steps.length) }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-sm tabular-nums">{step.count}</span>
                {/* Drop-off rides beside the bar rather than inside it — an
                    in-bar label would be clipped on the short steps. */}
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {step.from_previous == null ? '' : `${step.from_previous}%`}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {step.count} lead{step.count === 1 ? '' : 's'} reached {step.label}
              {step.from_previous != null && ` — ${step.from_previous}% of the previous stage`}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
