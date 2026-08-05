import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AllocationHealthBadge } from '@/components/shared/StatusBadge'
import { allocationHealth, slotMeasure } from '@/lib/allocation'
import { cn } from '@/lib/utils'
import {
  useAllocationUsers,
  useAllocateSlot,
  useReassignSlot,
  useReleaseSlot,
} from '@/hooks/useResources'

// The resource-allocation slot controls (R9) — the single staffing UI, used by
// the allocation step inside a lead's task stepper (`LeadTaskTab.AllocationStep`).
// Staffing a task is a set of per-slot actions (allocate / reassign / release),
// each an append-only history row (§4.7). The parent owns the final "Submit
// allocation" action; this component only handles per-slot staffing.
//
// It was extracted from the old cross-lead `pages/Resources.jsx` popup, which
// R9-3 retired in favour of staffing in place — `/resources` is now the Resource
// Manager's queue (`pages/MyResourceTasks.jsx`), which links into the stepper.
//
// R22: this is the **form** layout — labelled selects in a grid, for the stepper,
// where an allocation step reads like every other task's form. The Resources
// queue no longer renders it; that screen is a table whose cells are the pickers
// (`AllocationCells.jsx`). Behaviour is identical either way, so the two can
// still not drift on the rules; only the shape differs.

// Which slots hold at most one currently-allocated resource — the rest (White)
// is a pool that can carry several concurrent rows.
function isPool(slot) {
  return slot === 'white'
}

// R12 — the restored named extras (Auditors 3–4, Project Members 1–10). They are
// optional (`required` 0) and the backend only sends them to a Resource Manager,
// so the UI just renders whatever slots it is given; these are grouped into their
// own collapsible block to keep the core Red/Brown/White picture up front.
const PROJECT_MEMBER_PREFIX = 'project_member_'
const EXTRA_AUDITOR_SLOTS = ['auditor_3', 'auditor_4']

function isProjectMember(slot) {
  return slot.startsWith(PROJECT_MEMBER_PREFIX)
}

function isExtendedSlot(slot) {
  return isProjectMember(slot) || EXTRA_AUDITOR_SLOTS.includes(slot)
}

function filledCount(alloc, slots) {
  return slots.filter((s) => (alloc.occupants?.[s] || []).length > 0).length
}

// R24 — the wording for a slot whose requirement isn't comparable yet: the
// stage's manpower request hasn't been submitted, or the step isn't due. Staffing
// these in advance is expected, so an empty one is muted rather than amber and a
// filled one raises no excess flag. The requirement figure stays on screen where
// there is one — only the verdict is held back.
const WAITING_COPY = {
  manpower: {
    note: () => 'not requested yet',
    empty: 'Awaiting request',
    title: 'The manpower request for this stage hasn’t been submitted yet — assign someone now if you like, it counts as neither short nor excess.',
  },
  not_due: {
    note: (required) => (required > 0 ? `needs ${required} when due` : 'not due yet'),
    empty: 'Not due yet',
    title: 'This step isn’t due yet — assign people in advance if you like; nothing is counted until it opens.',
  },
  carry_over: {
    note: () => 'carries over',
    empty: 'Carries over',
    title: 'The Execution Red from the previous stage will be assigned when this step opens.',
  },
}

// True when the task still needs an Execution Red before it can be submitted —
// the successor task is assigned to whoever fills it (§7.5). Exported so each
// host can disable its own Submit button consistently.
export function isRedMissing(task) {
  const alloc = task.allocation || {}
  const slots = alloc.slots || []
  const hasRed = slots.includes('execution_red')
  const redOccupant = (alloc.occupants?.execution_red || [])[0]
  return hasRed && !redOccupant
}

// A single-occupancy slot (Execution Red / Brown / Auditor 1 / Auditor 2): at
// most one `allocated` row. Picking a user allocates (empty slot) or reassigns
// (already filled) — a reassign releases the old row and appends a new one
// linked by `replaces` (§4.7); it's never overwritten in place.
//
// R23-2a: the trigger shows the holder's name as **plain text read off the
// allocation row**, never through `<SelectValue>` (which resolves the display
// text from a matched `<SelectItem>`). That is not cosmetic. `/api/allocation-
// users/` is gated by `can_work_allocation_task`, which excludes every lead-side
// viewer once the allocation task closes — so the option list came back 403/empty
// and this control rendered **blank over a slot that was in fact filled**, which
// is what the user saw after a Resource Manager changed a Red. The belt filter
// (`ALLOCATION_SLOT_BELTS`) is a second route to the same blank. Same rule as
// `AllocationCells.jsx` (DD-R22-2) and design.md §5.
function SingleSlotControl({ slot, label, measure, occupant, users, usersLoading, disabled, onOpen, onAllocate, onReassign, onRelease }) {
  const name = occupant?.user_name?.name || occupant?.names
  const required = measure.required
  const waiting = measure.status === 'waiting' ? WAITING_COPY[measure.waiting] : null
  return (
    // `max-w-sm`: a name picker never needs to be wider than this, and the hosts
    // (an expanded table row, the lead's task stepper) are much wider than that.
    <div className="flex w-full max-w-sm flex-col gap-1.5">
      <Label className="text-xs">
        {label}{' '}
        {waiting ? (
          <span className="text-muted-foreground" title={waiting.title}>({waiting.note(required)})</span>
        ) : (
          required > 0 && <span className="text-muted-foreground">(need {required})</span>
        )}
        {slot === 'execution_red' && <span className="text-red-500"> *</span>}
      </Label>
      <div className="flex items-center gap-1.5">
        <Select
          value={occupant?.user ? String(occupant.user) : ''}
          disabled={disabled}
          onOpenChange={(open) => open && onOpen()}
          onValueChange={(v) => {
            const userId = Number(v)
            if (!userId) return
            if (occupant) onReassign(occupant.id, userId)
            else onAllocate(slot, userId)
          }}
        >
          <SelectTrigger className="w-full">
            <span className="truncate" title={name || undefined}>
              {name
                ? <span className="font-medium">{name}</span>
                : waiting
                  ? <span className="text-muted-foreground">{waiting.empty}</span>
                  : <span className={required > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}>
                      {required > 0 ? 'Not assigned' : 'Optional'}
                    </span>}
            </span>
          </SelectTrigger>
          <SelectContent position="popper">
            {usersLoading && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading people…</div>
            )}
            {!usersLoading && users.length === 0 && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">Nobody available</div>
            )}
            {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {/* R9 (DD-R9-9): the Execution Red is mandatory and can never be left
            empty — it changes by picking a different person (a reassign), not by
            releasing. The backend rejects a Red release too. */}
        {occupant && !disabled && slot !== 'execution_red' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="icon-sm" variant="ghost" onClick={() => onRelease(occupant.id)}>
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Release this slot</TooltipContent>
          </Tooltip>
        )}
      </div>
      {slot === 'execution_red' && (
        <p className="text-xs text-muted-foreground">
          {occupant
            ? 'Mandatory — pick a different person to hand the engagement over; their open tasks move with it.'
            : 'Required to submit — the next task is assigned to them.'}
        </p>
      )}
    </div>
  )
}

// White is a pool: several people may be allocated at once. Every White names a
// real person — R14-1 retired the old "TBD" (to-be-decided) fill, since TBD is
// not a user and an undecided White is just one that hasn't been added yet.
// Legacy `is_tbd` rows (pre-R14) are filtered out rather than shown as people.
function WhiteSlotControl({ measure, occupants, users, usersLoading, disabled, onOpen, onAllocate, onRelease }) {
  const allocatedNames = occupants.filter((o) => !o.is_tbd)
  const allocatedIds = new Set(allocatedNames.map((o) => o.user))
  const required = measure.required
  // R24: nothing to compare against until the stage's manpower request has been
  // submitted — Whites staffed in advance are neither short nor excess.
  const waiting = measure.status === 'waiting' ? WAITING_COPY[measure.waiting] : null
  // R23-3e: the White pool is the one slot that can genuinely be over-allocated
  // — everything else holds at most one row. Tech Req §4.7: over the approved
  // manpower is red, under it amber.
  const over = measure.measured && required > 0 && allocatedNames.length > required
  const short = measure.measured && required > 0 && allocatedNames.length < required

  // R9-6: picking a White allocates it there and then. The old two-step
  // "select, then press Add" lost the selection whenever someone forgot the
  // second click. The Select is a pure action trigger, so it holds no value.
  function pick(value) {
    onAllocate('white', Number(value))
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-1.5">
      <Label className="text-xs">
        White{' '}
        {waiting ? (
          <span className="text-muted-foreground" title={waiting.title}>({waiting.note(required)})</span>
        ) : (
          required > 0 && (
            <span className={cn(
              over ? 'text-red-600' : short ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
            )}>
              ({allocatedNames.length} of {required}
              {over ? ` — ${allocatedNames.length - required} over` : ''})
            </span>
          )
        )}
      </Label>
      <div className="flex flex-wrap gap-1.5">
        {allocatedNames.length === 0 && <span className="text-xs text-muted-foreground">None allocated yet.</span>}
        {allocatedNames.map((o) => (
          <span key={o.id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
            {o.user_name?.name || o.names}
            {!disabled && <X className="size-3 cursor-pointer opacity-70 hover:opacity-100" onClick={() => onRelease(o.id)} />}
          </span>
        ))}
      </div>
      {!disabled && (
        <Select value="" onOpenChange={(open) => open && onOpen()} onValueChange={pick}>
          <SelectTrigger className="w-full"><SelectValue placeholder="— Add a White —" /></SelectTrigger>
          <SelectContent position="popper">
            {usersLoading && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading people…</div>
            )}
            {users
              .filter((u) => !allocatedIds.has(u.id))
              .map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

// The per-slot staffing grid for one allocation task. `disabled` freezes it into
// a read-only view (a skipped/dropped task, or a user without D12 rights).
export function AllocationSlots({ task, disabled }) {
  const allocate = useAllocateSlot()
  const reassign = useReassignSlot()
  const release = useReleaseSlot()
  const [showExtras, setShowExtras] = useState(false)

  const alloc = task.allocation || {}
  const slots = alloc.slots || []
  const singleSlots = alloc.single_occupancy_slots || []
  const coreSlots = slots.filter((s) => !isExtendedSlot(s))
  const extraSlots = slots.filter(isExtendedSlot)

  // R23-2b: the four people-lookups used to fire on every render of this panel,
  // for every viewer — including the read-only lead-side viewers who get a 403
  // from `/api/allocation-users/` (it is gated by `can_work_allocation_task`).
  // They now load only once the relevant picker has actually been opened, and
  // never at all while the panel is read-only. Nothing on screen depends on
  // them: the holders' names come off the allocation rows (R23-2a).
  const [openedLists, setOpenedLists] = useState(() => new Set())
  const listKey = (slot) => (
    slot === 'execution_red' || slot === 'execution_brown' || slot === 'white' ? slot : 'other'
  )
  const wants = (key) => !disabled && openedLists.has(key)
  const openList = (slot) => setOpenedLists((prev) => {
    const key = listKey(slot)
    if (prev.has(key)) return prev
    return new Set(prev).add(key)
  })

  const red = useAllocationUsers({ taskId: wants('execution_red') ? task.id : null, slot: 'execution_red' })
  const brown = useAllocationUsers({ taskId: wants('execution_brown') ? task.id : null, slot: 'execution_brown' })
  const white = useAllocationUsers({ taskId: wants('white') ? task.id : null, slot: 'white' })
  const other = useAllocationUsers({ taskId: wants('other') ? task.id : null })
  const queryFor = (slot) => (
    slot === 'execution_red' ? red
      : slot === 'execution_brown' ? brown
        : slot === 'white' ? white
          : other
  )
  const usersFor = (slot) => queryFor(slot).data || []
  const usersLoadingFor = (slot) => queryFor(slot).isLoading

  async function handleAllocate(slot, userId) {
    try {
      await allocate.mutateAsync({ taskId: task.id, slot, userId })
    } catch (e) {
      toast.error(e.message)
    }
  }
  async function handleReassign(allocationId, userId) {
    try {
      await reassign.mutateAsync({ taskId: task.id, allocationId, userId })
      toast.success('Reassigned')
    } catch (e) {
      toast.error(e.message)
    }
  }
  async function handleRelease(allocationId) {
    try {
      await release.mutateAsync({ taskId: task.id, allocationId })
    } catch (e) {
      toast.error(e.message)
    }
  }

  const singleControl = (slot) => (
    <SingleSlotControl
      key={slot}
      slot={slot}
      label={alloc.slot_labels?.[slot] || slot}
      measure={slotMeasure(task, slot)}
      occupant={(alloc.occupants?.[slot] || [])[0]}
      users={usersFor(slot)}
      usersLoading={usersLoadingFor(slot)}
      disabled={disabled}
      onOpen={() => openList(slot)}
      onAllocate={handleAllocate}
      onReassign={handleReassign}
      onRelease={handleRelease}
    />
  )

  const extrasFilled = filledCount(alloc, extraSlots)
  const health = allocationHealth(task)

  return (
    <div className="flex flex-col gap-3">
      {/* R23-3e — Tech Req §4.7 wants the indicator "live in the allocation
          form" as well as in the queue, so the lead-side stepper reports the
          same verdict the Resource Manager sees. */}
      {health.status !== 'none' && (
        <div className="flex flex-wrap items-center gap-2">
          <AllocationHealthBadge health={health} />
          <span className="text-xs text-muted-foreground">
            {health.slots
              .map((s) => (
                s.status === 'waiting'
                  ? `${s.label} ${s.allocated} (${WAITING_COPY[s.waiting].note(s.required)})`
                  : `${s.label} ${s.allocated}/${s.required}`
              ))
              .join(' · ')}
            {' — against the manpower approved upstream.'}
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {coreSlots.filter((s) => singleSlots.includes(s)).map(singleControl)}
        {coreSlots.filter((s) => isPool(s)).map((slot) => (
          <WhiteSlotControl
            key={slot}
            measure={slotMeasure(task, slot)}
            occupants={alloc.occupants?.[slot] || []}
            users={usersFor(slot)}
            usersLoading={usersLoadingFor(slot)}
            disabled={disabled}
            onOpen={() => openList(slot)}
            onAllocate={handleAllocate}
            onRelease={handleRelease}
          />
        ))}
      </div>

      {/* R12 — the named extras, Resource-Manager-only (the backend omits them
          for anyone else, so their mere presence means the viewer may fill them).
          Optional, and collapsed by default so they don't bury the core slots. */}
      {extraSlots.length > 0 && (
        <div className="rounded-md border">
          <button
            type="button"
            onClick={() => setShowExtras((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-accent/50"
          >
            <span className="flex items-center gap-2">
              {showExtras ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              Named team &amp; auditor slots
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {extrasFilled} of {extraSlots.length} filled · optional · Resource Manager only
            </span>
          </button>
          {showExtras && (
            <div className="grid grid-cols-1 gap-3 border-t p-3 sm:grid-cols-2 xl:grid-cols-3">
              {extraSlots.map(singleControl)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
