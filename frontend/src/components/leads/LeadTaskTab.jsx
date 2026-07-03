import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TaskStatusBadge } from '@/components/shared/StatusBadge'
import { ChecklistItemRow } from './ChecklistItemRow'
import { TaskStepFields } from './TaskStepFields'
import { TaskStepper } from './TaskStepper'
import { TaskStepperVertical } from './TaskStepperVertical'
import { useLeadTasks, useLeadChecklist } from '@/hooks/useChecklist'

// The lead's single execution track — task/steps + checklist instantiated
// from its lead type template (§7). Only the active step's checklist renders
// at a time (instead of stacking every step's items) so long BD checklists
// don't turn the page into one long scroll. Steps stay clickable in any
// order — nothing forces the lead through them sequentially.
// Layout: a vertical step rail sits to the left of the checklist on wider
// screens; on narrow screens that rail collapses into a horizontal strip
// above the checklist so the page never needs horizontal scrolling.
export function LeadTaskTab({ leadId, canUpdate }) {
  const { data: tasks = [] } = useLeadTasks(leadId)
  const { data: items = [] } = useLeadChecklist(leadId)
  const [activeId, setActiveId] = useState(null)

  useEffect(() => {
    if (activeId || tasks.length === 0) return
    const firstIncomplete = tasks.find((t) => t.status !== 'Completed')
    setActiveId((firstIncomplete || tasks[tasks.length - 1]).id)
  }, [tasks, activeId])

  const itemCounts = useMemo(() => {
    const map = {}
    for (const task of tasks) {
      const taskItems = items.filter((i) => i.lead_task_id === task.id)
      map[task.id] = { done: taskItems.filter((i) => i.state === 'done' || i.state === 'na').length, total: taskItems.length }
    }
    return map
  }, [tasks, items])

  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">No task template instantiated for this lead yet.</p>
  }

  const activeTask = tasks.find((t) => t.id === activeId) || tasks[0]
  const activeItems = items.filter((i) => i.lead_task_id === activeTask.id).sort((a, b) => a.order - b.order)

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <Card className="md:hidden">
        <CardContent className="p-4">
          <TaskStepper tasks={tasks} activeId={activeTask.id} onSelect={setActiveId} />
        </CardContent>
      </Card>

      <Card className="hidden shrink-0 md:sticky md:top-4 md:block md:w-60">
        <CardContent className="p-2">
          <TaskStepperVertical tasks={tasks} activeId={activeTask.id} onSelect={setActiveId} itemCounts={itemCounts} />
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{activeTask.name}</CardTitle>
              <TaskStatusBadge status={activeTask.status} />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {activeItems.map((item) => (
              <ChecklistItemRow key={item.id} item={item} canUpdate={canUpdate} leadId={leadId} />
            ))}
          </CardContent>
        </Card>

        <TaskStepFields taskId={activeTask.id} canUpdate={canUpdate} />
      </div>
    </div>
  )
}
