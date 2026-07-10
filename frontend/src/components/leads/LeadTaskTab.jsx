import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, PauseCircle, PlayCircle, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TaskStateBadge } from '@/components/shared/StatusBadge'
import { ChecklistItemRow } from './ChecklistItemRow'
import { TaskStepFields } from './TaskStepFields'
import { TaskStepper } from './TaskStepper'
import { TaskStepperVertical } from './TaskStepperVertical'
import { useLeadTasks, useCompleteTask, useReassignTask } from '@/hooks/useTasks'
import { useHoldTask, useUnholdTask } from '@/hooks/useHolds'
import { useAssignableUsers } from '@/hooks/useLookups'

// The lead's BD workflow track (Phase 4) — the 17-task sequence instantiated
// by the backend engine. Tasks are listed in the order they opened (loops and
// extension cycles append later instances). Only the active task's checklist +
// fields render at a time. Editing is gated by the backend's per-task
// `can_edit` (assignee + open only, Tech Req §6). A task closes via Save &
// Complete, which opens the next task(s) per the workflow routing.
function ReassignDialog({ task, leadId, owners }) {
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState('')
  const reassign = useReassignTask(leadId)

  async function handleSave() {
    try {
      await reassign.mutateAsync({ taskId: task.id, userId: Number(userId) })
      toast.success('Task reassigned')
      setOpen(false)
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UserCog className="size-4" /> Reassign
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reassign task</DialogTitle></DialogHeader>
          <p className="-mt-2 text-sm text-muted-foreground">{task.task_name}</p>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select a user…" /></SelectTrigger>
            <SelectContent>
              {owners.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.name || u.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleSave} disabled={!userId || reassign.isPending}>
              {reassign.isPending ? 'Saving…' : 'Reassign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Task-level hold/unhold (Phase 5). A held task is non-editable until resumed;
// `can_hold` from the backend gates who may act (assignee / lead owner / admin).
function TaskHoldButton({ task, leadId }) {
  const hold = useHoldTask()
  const unhold = useUnholdTask()
  const isHeld = task.status === 'hold'

  function handleClick() {
    const action = isHeld ? unhold : hold
    action.mutate(
      { taskId: task.id, leadId },
      {
        onSuccess: () => toast.success(isHeld ? 'Task resumed' : 'Task put on hold'),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={handleClick} disabled={hold.isPending || unhold.isPending}>
      {isHeld ? <><PlayCircle className="size-4" /> Unhold</> : <><PauseCircle className="size-4" /> Hold</>}
    </Button>
  )
}

export function LeadTaskTab({ leadId }) {
  const { data: tasks = [], isLoading } = useLeadTasks(leadId)
  const { data: owners = [] } = useAssignableUsers(true)
  const completeTask = useCompleteTask(leadId)
  const [activeId, setActiveId] = useState(null)

  // Default to the first still-open task (the one that needs work), else the
  // last task in the list.
  const defaultActive = useMemo(() => {
    const firstOpen = tasks.find((t) => t.status === 'open')
    return (firstOpen || tasks[tasks.length - 1])?.id ?? null
  }, [tasks])

  useEffect(() => {
    if (activeId && tasks.some((t) => t.id === activeId)) return
    setActiveId(defaultActive)
  }, [tasks, activeId, defaultActive])

  const itemCounts = useMemo(() => {
    const map = {}
    for (const t of tasks) {
      const items = t.checklist_items || []
      map[t.id] = { done: items.filter((i) => i.status === 'complete').length, total: items.length }
    }
    return map
  }, [tasks])

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading tasks…</p>
  if (tasks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No workflow tasks yet. Task 1 opens once the lead is assigned an owner.
      </p>
    )
  }

  const activeTask = tasks.find((t) => t.id === activeId) || tasks[tasks.length - 1]
  const canEdit = !!activeTask.can_edit
  const items = activeTask.checklist_items || []
  const allComplete = items.length > 0 && items.every((i) => i.status === 'complete')

  async function handleComplete() {
    try {
      const res = await completeTask.mutateAsync({ taskId: activeTask.id })
      const opened = res?.opened_tasks || []
      toast.success(opened.length ? `Task completed — opened: ${opened.map((t) => t.task_name).join(', ')}` : 'Task completed')
      if (opened.length) setActiveId(opened[0].id)
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <Card className="md:hidden">
        <CardContent className="p-4">
          <TaskStepper tasks={tasks} activeId={activeTask.id} onSelect={setActiveId} />
        </CardContent>
      </Card>

      <Card className="hidden shrink-0 md:sticky md:top-4 md:block md:w-64">
        <CardContent className="max-h-[70vh] overflow-y-auto p-2">
          <TaskStepperVertical tasks={tasks} activeId={activeTask.id} onSelect={setActiveId} itemCounts={itemCounts} />
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                <span className="text-muted-foreground">Task {activeTask.task_no}.</span> {activeTask.task_name}
              </CardTitle>
              <div className="flex items-center gap-2">
                <TaskStateBadge status={activeTask.status} />
                {activeTask.can_hold && (activeTask.status === 'open' || activeTask.status === 'hold') && (
                  <TaskHoldButton task={activeTask} leadId={leadId} />
                )}
                {activeTask.status === 'open' && owners.length > 0 && (
                  <ReassignDialog task={activeTask} leadId={leadId} owners={owners} />
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {activeTask.assigned_to_name
                ? `Assigned to ${activeTask.assigned_to_name}`
                : 'Not assigned — assignment handled during resource allocation (Phase 6).'}
              {!canEdit && activeTask.status === 'open' && ' · View only (you are not the assignee).'}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {activeTask.is_allocation_task && (
              <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                Resource-allocation step — the Resource Manager fills the allocation
                form here (built in Phase 6). It carries no checklist.
              </p>
            )}
            {items.length === 0 && !activeTask.is_allocation_task && (
              <p className="text-sm text-muted-foreground">No checklist items for this task.</p>
            )}
            {items.map((item) => (
              <ChecklistItemRow key={item.id} item={item} canEdit={canEdit} leadId={leadId} />
            ))}
          </CardContent>
        </Card>

        <TaskStepFields task={activeTask} leadId={leadId} canEdit={canEdit} />

        {canEdit && (
          <div className="flex items-center justify-end gap-2">
            {!allComplete && items.length > 0 && (
              <span className="text-xs text-muted-foreground">Complete every checklist item to close this task.</span>
            )}
            <Button onClick={handleComplete} disabled={completeTask.isPending || (items.length > 0 && !allComplete)}>
              <CheckCircle2 className="size-4" />
              {completeTask.isPending ? 'Completing…' : 'Save & Complete'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
