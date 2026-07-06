import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TaskStatusBadge } from '@/components/shared/StatusBadge'
import { ChecklistItemRow } from './ChecklistItemRow'
import { TaskStepFields } from './TaskStepFields'
import { TaskStepper } from './TaskStepper'
import { TaskStepperVertical } from './TaskStepperVertical'
import { useLeadTasks, useLeadChecklist } from '@/hooks/useChecklist'
import { useUsers } from '@/hooks/useUsers'

// The lead's single execution track — task/steps + checklist instantiated
// from its lead type template (§7). Only the active step's checklist renders
// at a time (instead of stacking every step's items) so long checklists
// don't turn the page into one long scroll. Every step is freely viewable in
// any order, but *interacting* with a step (checking items, editing its
// Additional details fields) is only allowed once every earlier step is
// fully Completed — items and, now, that step's fields too (§8.3). Within
// the active step, items themselves must still be worked in order.
// Layout: a vertical step rail sits to the left of the checklist on wider
// screens; on narrow screens that rail collapses into a horizontal strip
// above the checklist so the page never needs horizontal scrolling.
export function LeadTaskTab({ leadId, canUpdate }) {
  const { data: tasks = [] } = useLeadTasks(leadId)
  const { data: items = [] } = useLeadChecklist(leadId)
  const { data: users = [] } = useUsers()
  const [activeId, setActiveId] = useState(null)

  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])

  const firstIncompleteIndex = useMemo(() => {
    const idx = tasks.findIndex((t) => t.status !== 'Completed')
    return idx === -1 ? tasks.length - 1 : idx
  }, [tasks])

  useEffect(() => {
    if (activeId || tasks.length === 0) return
    setActiveId(tasks[firstIncompleteIndex]?.id)
  }, [tasks, activeId, firstIncompleteIndex])

  const itemCounts = useMemo(() => {
    const map = {}
    for (const task of tasks) {
      const taskItems = items.filter((i) => i.lead_task_id === task.id)
      map[task.id] = { done: taskItems.filter((i) => i.state === 'done' || i.state === 'na').length, total: taskItems.length }
    }
    return map
  }, [tasks, items])

  function handleSelectStep(taskId) {
    setActiveId(taskId)
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">No task template instantiated for this lead yet.</p>
  }

  const activeTask = tasks.find((t) => t.id === activeId) || tasks[firstIncompleteIndex]
  const activeTaskIndex = tasks.findIndex((t) => t.id === activeTask.id)
  const stepEditable = activeTaskIndex <= firstIncompleteIndex
  const activeCanUpdate = canUpdate && stepEditable
  const activeItems = items.filter((i) => i.lead_task_id === activeTask.id).sort((a, b) => a.order - b.order)
  const firstIncompleteItemIndex = activeItems.findIndex((i) => i.state !== 'done' && i.state !== 'na')

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <Card className="md:hidden">
        <CardContent className="p-4">
          <TaskStepper tasks={tasks} activeId={activeTask.id} onSelect={handleSelectStep} />
        </CardContent>
      </Card>

      <Card className="hidden shrink-0 md:sticky md:top-4 md:block md:w-60">
        <CardContent className="p-2">
          <TaskStepperVertical tasks={tasks} activeId={activeTask.id} onSelect={handleSelectStep} itemCounts={itemCounts} />
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{activeTask.name}</CardTitle>
              <TaskStatusBadge status={activeTask.status} />
            </div>
            {!stepEditable && (
              <p className="text-xs text-muted-foreground">View only — complete every earlier step (including its Additional details) to edit here.</p>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {activeItems.length === 0 && <p className="text-sm text-muted-foreground">No checklist items for this step.</p>}
            {activeItems.map((item, i) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                canUpdate={activeCanUpdate}
                leadId={leadId}
                userById={userById}
                locked={firstIncompleteItemIndex !== -1 && i > firstIncompleteItemIndex}
              />
            ))}
          </CardContent>
        </Card>

        <TaskStepFields taskId={activeTask.id} leadId={leadId} canUpdate={activeCanUpdate} />
      </div>
    </div>
  )
}
