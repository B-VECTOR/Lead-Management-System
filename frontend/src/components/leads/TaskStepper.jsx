import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// Horizontal step indicator for the lead's workflow tasks (Phase 4). Clicking
// a step switches which task's checklist/fields show below. Backend statuses:
// closed = completed, open = in progress, pending/hold = not yet worked.
export function TaskStepper({ tasks, activeId, onSelect }) {
  return (
    <div className="flex items-center overflow-x-auto pb-1">
      {tasks.map((task, i) => {
        const isActive = task.id === activeId
        const isCompleted = task.status === 'closed'
        const isStarted = task.status === 'open'

        return (
          <div key={task.id} className="flex items-center">
            <button
              type="button"
              onClick={() => onSelect(task.id)}
              className="flex shrink-0 flex-col items-center gap-1.5 px-2"
            >
              <span
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors',
                  isCompleted && 'border-emerald-500 bg-emerald-500 text-white',
                  !isCompleted && isStarted && 'border-blue-500 text-blue-600',
                  !isCompleted && !isStarted && 'border-muted-foreground/30 text-muted-foreground',
                  isActive && !isCompleted && 'ring-2 ring-offset-2 ring-primary/40'
                )}
              >
                {isCompleted ? <Check className="size-4" /> : task.task_no}
              </span>
              <span className={cn('max-w-24 truncate text-xs font-medium', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                {task.task_name}
              </span>
            </button>
            {i < tasks.length - 1 && (
              <div className={cn('mb-5 h-0.5 w-8 shrink-0 sm:w-16', isCompleted ? 'bg-emerald-500' : 'bg-muted-foreground/20')} />
            )}
          </div>
        )
      })}
    </div>
  )
}
