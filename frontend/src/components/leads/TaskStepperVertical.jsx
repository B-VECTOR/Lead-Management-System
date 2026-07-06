import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// Vertical rail version of TaskStepper for wider screens — sits to the left
// of the active step's checklist instead of spanning full width horizontally.
// Every step is always viewable/clickable; whether it can be *edited* is a
// separate, interaction-level gate handled by LeadTaskTab.
export function TaskStepperVertical({ tasks, activeId, onSelect, itemCounts }) {
  return (
    <div className="flex flex-col">
      {tasks.map((task, i) => {
        const isActive = task.id === activeId
        const isCompleted = task.status === 'Completed'
        const isStarted = task.status === 'In progress'
        const counts = itemCounts?.[task.id]

        return (
          <button
            key={task.id}
            type="button"
            onClick={() => onSelect(task.id)}
            className={cn(
              'flex items-stretch gap-3 rounded-md px-2 py-2 text-left transition-colors',
              isActive ? 'bg-accent' : 'hover:bg-accent/50'
            )}
          >
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors',
                  isCompleted && 'border-emerald-500 bg-emerald-500 text-white',
                  !isCompleted && isStarted && 'border-blue-500 text-blue-600',
                  !isCompleted && !isStarted && 'border-muted-foreground/30 text-muted-foreground',
                  isActive && !isCompleted && 'ring-2 ring-offset-2 ring-primary/40'
                )}
              >
                {isCompleted ? <Check className="size-3.5" /> : i + 1}
              </span>
              {i < tasks.length - 1 && (
                <div className={cn('my-1 w-0.5 flex-1', isCompleted ? 'bg-emerald-500' : 'bg-muted-foreground/20')} />
              )}
            </div>
            <div className="min-w-0 flex-1 pb-3">
              <p className={cn('truncate text-sm font-medium', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                {task.name}
              </p>
              {counts && (
                <p className="text-xs text-muted-foreground">{counts.done}/{counts.total} done</p>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
