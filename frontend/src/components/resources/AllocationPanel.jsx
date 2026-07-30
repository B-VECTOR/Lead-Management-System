import { toast } from 'sonner'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { AllocationSlots, isRedMissing } from '@/components/resources/AllocationSlots'
import { useSubmitAllocationTask } from '@/hooks/useResources'

// The one staffing surface for an allocation task (3/10/17/18/24/25): the slot
// grid plus the "Submit allocation" action and the copy that explains what state
// the allocation is in. Used by **both** hosts — the Resources queue's expandable
// row (`pages/MyResourceTasks.jsx`, R12-1) and the lead's task stepper
// (`LeadTaskTab.AllocationStep`, for the lead's Default BD Person under D12) — so
// the two can't drift apart the way R9's popup and stepper did (DD-R9-8).
//
// Three state rules, all mirrored server-side:
//  - Staffable while the viewer has rights and the task isn't skipped/dropped.
//    For a **closed** task that means the Resource Manager alone, who keeps the
//    mid-engagement change privilege (R12-5, `can_work_allocation_task`).
//  - Submit only exists while the task is still in play (open/pending).
//  - A `pending` (trigger-gated) task is staffable **in advance** — the point of
//    R12-4: allocate Task 18's auditors early and it closes itself on open.
export function AllocationPanel({ task, onSubmitted, showIntro = false }) {
  const submit = useSubmitAllocationTask()

  const frozen = ['skipped', 'dropped'].includes(task.status)
  const staffable = !!task.can_staff && !frozen
  const inPlay = ['open', 'pending', 'hold'].includes(task.status)
  const redMissing = isRedMissing(task)
  const opensOn = task.scheduled_open?.open_date

  async function handleSubmit() {
    try {
      const res = await submit.mutateAsync({ taskId: task.id })
      toast.success('Resources allocated — next task opened')
      onSubmitted?.(res)
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {showIntro && (
        <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          Resource-allocation step — assign each slot below. It carries no checklist;
          submitting it opens the next task{!task.is_hanging_task ? ' for the chosen Execution Red' : ''}.
          {!task.can_staff && ' You can view the allocation but only the Resource Manager or the lead owner can assign it.'}
        </p>
      )}

      {/* Advance allocation (R12-4): a trigger-gated task can be staffed before
          its date, and an auto-closing one needs no visit at all afterwards. */}
      {task.status === 'pending' && staffable && (
        <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          Not due yet{opensOn ? ` — opens ${formatDate(opensOn)}` : ''}. You can allocate now:
          {task.auto_closes_when_staffed
            ? ' with the required slots filled, this step completes itself when it opens, so it never lands in your queue.'
            : ' the allocation is kept and the step opens already assigned.'}
        </p>
      )}

      {/* Mid-engagement reassignment (R12-5). */}
      {task.status === 'closed' && staffable && (
        <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          Already submitted — the allocation stays live until these resources are released,
          so you can still change who holds a slot. Picking someone else releases the current
          holder and records the handover; open tasks driven by an Execution Red move with it.
        </p>
      )}

      <AllocationSlots task={task} disabled={!staffable} />

      {staffable && inPlay && (
        <div className="flex items-center justify-end">
          <Button
            onClick={handleSubmit}
            disabled={submit.isPending || redMissing}
            title={redMissing ? 'Select an Execution Red first' : undefined}
          >
            <CheckCircle2 className="size-4" />
            {submit.isPending ? 'Submitting…' : 'Submit allocation'}
          </Button>
        </div>
      )}
    </div>
  )
}
