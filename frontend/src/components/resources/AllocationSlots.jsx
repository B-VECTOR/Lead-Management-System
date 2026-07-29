import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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

const NONE = '__none__'
const TBD = '__tbd__'

// Which slots hold at most one currently-allocated resource — the rest (White)
// is a pool that can carry several concurrent rows.
function isPool(slot) {
  return slot === 'white'
}

// A compact "slot allocated/required" summary line for a task, with over/under
// flags — shared by the Resources grid and the My-Tasks (Resource) list.
export function slotSummary(task) {
  const alloc = task.allocation
  if (!alloc) return null
  const parts = []
  let over = false
  let under = false
  for (const slot of alloc.slots || []) {
    const required = alloc.required?.[slot] || 0
    const count = (alloc.occupants?.[slot] || []).length
    if (required === 0 && count === 0) continue
    if (required > 0 && count > required) over = true
    if (required > 0 && count < required) under = true
    parts.push(`${alloc.slot_labels?.[slot] || slot} ${count}/${required || count}`)
  }
  return { text: parts.join(' · '), over, under }
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
function SingleSlotControl({ slot, label, required, occupant, users, disabled, onAllocate, onReassign, onRelease }) {
  const value = occupant?.user ? String(occupant.user) : NONE
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">
        {label} {required > 0 && <span className="text-muted-foreground">(need {required})</span>}
        {slot === 'execution_red' && <span className="text-red-500"> *</span>}
      </Label>
      <div className="flex items-center gap-1.5">
        <Select
          value={value}
          disabled={disabled}
          onValueChange={(v) => {
            if (v === NONE) return
            const userId = Number(v)
            if (occupant) onReassign(occupant.id, userId)
            else onAllocate(slot, userId)
          }}
        >
          <SelectTrigger className="w-full"><SelectValue placeholder="— Select —" /></SelectTrigger>
          <SelectContent position="popper">
            {!occupant && <SelectItem value={NONE}>— None —</SelectItem>}
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

// White is a pool: several people may be allocated at once, and a slot may be
// left "TBD" (to-be-decided) instead of naming someone (PRD §5.7).
function WhiteSlotControl({ required, occupants, users, disabled, onAllocate, onRelease }) {
  const allocatedNames = occupants.filter((o) => !o.is_tbd)
  const tbdCount = occupants.filter((o) => o.is_tbd).length
  const allocatedIds = new Set(allocatedNames.map((o) => o.user))

  // R9-6: picking a White allocates it there and then. The old two-step
  // "select, then press Add" lost the selection whenever someone forgot the
  // second click. The Select is a pure action trigger, so it holds no value.
  function pick(value) {
    if (value === TBD) onAllocate('white', null, true)
    else onAllocate('white', Number(value))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">White {required > 0 && <span className="text-muted-foreground">(need {required})</span>}</Label>
      <div className="flex flex-wrap gap-1.5">
        {occupants.length === 0 && <span className="text-xs text-muted-foreground">None allocated yet.</span>}
        {allocatedNames.map((o) => (
          <span key={o.id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
            {o.user_name?.name}
            {!disabled && <X className="size-3 cursor-pointer opacity-70 hover:opacity-100" onClick={() => onRelease(o.id)} />}
          </span>
        ))}
        {Array.from({ length: tbdCount }).map((_, i) => {
          const o = occupants.filter((x) => x.is_tbd)[i]
          return (
            <span key={o.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              TBD
              {!disabled && <X className="size-3 cursor-pointer opacity-70 hover:opacity-100" onClick={() => onRelease(o.id)} />}
            </span>
          )
        })}
      </div>
      {!disabled && (
        <Select value="" onValueChange={pick}>
          <SelectTrigger className="w-full"><SelectValue placeholder="— Add a White —" /></SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={TBD}>Leave as TBD</SelectItem>
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
// a read-only view (a closed/skipped task, or a user without D12 rights).
export function AllocationSlots({ task, disabled }) {
  const allocate = useAllocateSlot()
  const reassign = useReassignSlot()
  const release = useReleaseSlot()

  const alloc = task.allocation || {}
  const slots = alloc.slots || []
  const singleSlots = alloc.single_occupancy_slots || []

  const { data: redUsers = [] } = useAllocationUsers({ taskId: task.id, slot: 'execution_red' })
  const { data: brownUsers = [] } = useAllocationUsers({ taskId: task.id, slot: 'execution_brown' })
  const { data: whiteUsers = [] } = useAllocationUsers({ taskId: task.id, slot: 'white' })
  const { data: plainUsers = [] } = useAllocationUsers({ taskId: task.id })
  const usersFor = (slot) => (
    slot === 'execution_red' ? redUsers
      : slot === 'execution_brown' ? brownUsers
        : slot === 'white' ? whiteUsers
          : plainUsers
  )

  async function handleAllocate(slot, userId, isTbd = false) {
    try {
      await allocate.mutateAsync({ taskId: task.id, slot, userId, isTbd })
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

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {slots.filter((s) => singleSlots.includes(s)).map((slot) => (
        <SingleSlotControl
          key={slot}
          slot={slot}
          label={alloc.slot_labels?.[slot] || slot}
          required={alloc.required?.[slot] || 0}
          occupant={(alloc.occupants?.[slot] || [])[0]}
          users={usersFor(slot)}
          disabled={disabled}
          onAllocate={handleAllocate}
          onReassign={handleReassign}
          onRelease={handleRelease}
        />
      ))}
      {slots.filter((s) => isPool(s)).map((slot) => (
        <WhiteSlotControl
          key={slot}
          required={alloc.required?.[slot] || 0}
          occupants={alloc.occupants?.[slot] || []}
          users={usersFor(slot)}
          disabled={disabled}
          onAllocate={handleAllocate}
          onRelease={handleRelease}
        />
      ))}
    </div>
  )
}
