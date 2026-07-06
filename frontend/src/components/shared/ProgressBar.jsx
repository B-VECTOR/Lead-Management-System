// Horizontal alternative to ProgressRing for dense contexts like a table row,
// where a small ring's percentage label is hard to read at a glance.
export function ProgressBar({ value = 0 }) {
  const color = value >= 100 ? 'bg-emerald-500' : value > 0 ? 'bg-blue-500' : 'bg-neutral-300 dark:bg-neutral-700'
  return (
    <div className="flex min-w-[110px] items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">{value}%</span>
    </div>
  )
}
