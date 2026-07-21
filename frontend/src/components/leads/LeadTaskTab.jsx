import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TaskStateBadge } from '@/components/shared/StatusBadge'
import { ChecklistItemRow } from './ChecklistItemRow'
import { HoldActionButton } from './HoldActionButton'
import { TaskStepFields } from './TaskStepFields'
import { TaskStepper } from './TaskStepper'
import { TaskStepperVertical } from './TaskStepperVertical'
import { useLeadTasks, useCompleteTask, useReassignTask } from '@/hooks/useTasks'
import { useHoldTask, useUnholdTask } from '@/hooks/useHolds'
import { useAssignableUsers } from '@/hooks/useLookups'
import { useAuth } from '@/context/AuthContext'

// A trigger task's scheduled open date is a date-only string ("2026-08-12");
// pin it to local midnight so it never shifts a day when formatted.
function formatOpenDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

// The lead's BD workflow track (Phase 4) — the 17-task sequence instantiated
// by the backend engine. Tasks are listed in the order they opened (loops and
// extension cycles append later instances). Only the active task's checklist +
// fields render at a time. Editing/reassign are gated by the backend's
// per-task `can_edit`/`can_reassign` (Phase 11: the task's assignee only, or
// Lead Admin, while open — Tech Req §6). A task closes via Save & Complete,
// which opens the next task(s) per the workflow routing.
function ReassignDialog({ task, leadId, owners }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState('')
  const [remark, setRemark] = useState('')
  const reassign = useReassignTask(leadId)

  async function handleSave() {
    try {
      await reassign.mutateAsync({ taskId: task.id, userId: Number(userId), remark: remark.trim() })
      toast.success('Task reassigned')
      setRemark('')
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
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name || u.username}{u.id === user?.id ? ' (self)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-reassign-remark">Remark (optional)</Label>
            <Textarea
              id="task-reassign-remark"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Reason for the reassignment…"
              rows={3}
            />
          </div>
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
// `can_hold` from the backend gates who may act (Phase 11: the task assignee, or
// Lead Admin). The optional remark is recorded on the activity log (#1).
function TaskHoldButton({ task, leadId }) {
  const hold = useHoldTask()
  const unhold = useUnholdTask()
  const isHeld = task.status === 'hold'

  function handleConfirm(remark) {
    const action = isHeld ? unhold : hold
    action.mutate(
      { taskId: task.id, leadId, remark },
      {
        onSuccess: () => toast.success(isHeld ? 'Task resumed' : 'Task put on hold'),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <HoldActionButton
      isHeld={isHeld}
      noun="task"
      size="sm"
      pending={hold.isPending || unhold.isPending}
      onConfirm={handleConfirm}
    />
  )
}

export function LeadTaskTab({ leadId }) {
  const { data: tasks = [], isLoading } = useLeadTasks(leadId)
  const { data: owners = [] } = useAssignableUsers(true)
  const completeTask = useCompleteTask(leadId)
  const [activeId, setActiveId] = useState(null)
  const fieldsRef = useRef(null)
  // Id of a task we've just opened by completing a step but which hasn't yet
  // arrived in the (refetching) list — so the reset effect doesn't clobber the
  // auto-advance before the new task loads (#12d).
  const awaitingId = useRef(null)

  // Default to the first still-open task (the one that needs work), else the
  // last task in the list.
  const defaultActive = useMemo(() => {
    const firstOpen = tasks.find((t) => t.status === 'open')
    return (firstOpen || tasks[tasks.length - 1])?.id ?? null
  }, [tasks])

  useEffect(() => {
    if (activeId && tasks.some((t) => t.id === activeId)) {
      awaitingId.current = null
      return
    }
    // Hold position while a just-opened successor is still loading.
    if (awaitingId.current) return
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
      // Persist whatever is currently typed in "Additional details" before
      // closing — completing used to validate against stale/last-drafted
      // values, which surfaced as a false "field is missing" error.
      await fieldsRef.current?.saveDraft()
      const res = await completeTask.mutateAsync({ taskId: activeTask.id })
      const opened = res?.opened_tasks || []
      toast.success(opened.length ? `Task completed — opened: ${opened.map((t) => t.task_name).join(', ')}` : 'Task completed')
      // Auto-advance to the next step (open or trigger-pending). awaitingId keeps
      // the selection until the refetch delivers the new task.
      if (opened.length) {
        awaitingId.current = opened[0].id
        setActiveId(opened[0].id)
      }
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
                {activeTask.can_reassign && owners.length > 0 && (
                  <ReassignDialog task={activeTask} leadId={leadId} owners={owners} />
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {activeTask.assigned_to_name
                ? `Assigned to ${activeTask.assigned_to_name}`
                : 'Not assigned — assignment handled during resource allocation (Phase 6).'}
              {!canEdit && activeTask.status === 'open' && " · View only (you don't have edit access to this task)."}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {activeTask.status === 'pending' && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {activeTask.scheduled_open ? (
                  <>
                    <p className="font-medium">
                      Not open yet — scheduled to open on {formatOpenDate(activeTask.scheduled_open.open_date)}.
                    </p>
                    <p className="mt-0.5 text-xs">
                      {activeTask.scheduled_open.days_from_now > 0
                        ? `Opens in ${activeTask.scheduled_open.days_from_now} day${activeTask.scheduled_open.days_from_now === 1 ? '' : 's'}`
                        : 'Due now — it opens on the next scheduled run'}
                      {` · configured to open ${activeTask.scheduled_open.offset_days} day${activeTask.scheduled_open.offset_days === 1 ? '' : 's'} before the reference date captured in Task ${activeTask.scheduled_open.reference_task_no}.`}
                    </p>
                  </>
                ) : (
                  <p className="font-medium">
                    Not open yet — this task opens automatically once its trigger date is reached.
                  </p>
                )}
              </div>
            )}
            {activeTask.status === 'hold' && (() => {
              const activeHold = (activeTask.holds || []).find((h) => !h.unhold_at)
              return activeHold ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <p className="font-medium">
                    On hold{activeHold.hold_by_name ? ` — by ${activeHold.hold_by_name}` : ''}
                  </p>
                  {activeHold.reason && <p className="mt-0.5">{activeHold.reason}</p>}
                </div>
              ) : null
            })()}
            {activeTask.status === 'skipped' && (
              <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                {activeTask.short_closed
                  ? 'Skipped — the project was short-closed; work moved directly to Project Closure.'
                  : 'Skipped — the workflow branched around this step, so it never opened.'}
              </p>
            )}
            {activeTask.status === 'dropped' && (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                Dropped — this task was open when the lead was dropped.
              </p>
            )}
            {activeTask.is_allocation_task && activeTask.status !== 'skipped' && (
              <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                Resource-allocation step — the Resource Manager fills the allocation
                form here (built in Phase 6). It carries no checklist.
              </p>
            )}
            {items.length === 0 && !activeTask.is_allocation_task && !['skipped', 'dropped'].includes(activeTask.status) && (
              <p className="text-sm text-muted-foreground">No checklist items for this task.</p>
            )}
            {items.map((item) => (
              <ChecklistItemRow key={item.id} item={item} canEdit={canEdit} leadId={leadId} />
            ))}
          </CardContent>
        </Card>

        <TaskStepFields ref={fieldsRef} task={activeTask} leadId={leadId} canEdit={canEdit} />

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
