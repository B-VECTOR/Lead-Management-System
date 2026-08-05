import { useState } from 'react'
import { toast } from 'sonner'
import { CornerDownRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { slotMeasure } from '@/lib/allocation'
import { cn } from '@/lib/utils'
import {
  useAllocateSlot,
  useAllocationUsers,
  useReassignSlot,
  useReleaseSlot,
} from '@/hooks/useResources'

// Staffing controls shaped for a **table cell** (R22) — the Resources queue is a
// flat one-row-per-step table where each role has its own column and the cell is
// the people-picker, so the whole job is done without expanding anything (per the
// user, 2026-08-05: a table like Project Closure, "information quick and take
// action there itself").
//
// Deliberately separate from `AllocationSlots.jsx`, which stays the *form* layout
// (labelled selects in a grid) used by the lead's task stepper — the two hosts
// want genuinely different shapes, and sharing one component is what forced the
// queue into an expandable panel in the first place.
//
// Two rules the cells encode (both mirrored server-side):
//  - A single-occupancy slot is changed by picking a different person — that's a
//    *reassign* (releases the old row, appends a new one, §4.7), never an
//    in-place edit. Only White is a pool that holds several people at once.
//  - The Execution Red can never be emptied (DD-R9-9) — no release control — and
//    an allocation task can't be submitted without one.

const NONE = '__none__'

// The muted stand-in for a slot whose requirement isn't comparable yet (R24) —
// the manpower request for the stage hasn't been submitted, or the step isn't due.
// It replaces the amber "Not assigned", which claimed a shortage against a step
// nobody can act on: staffing these in advance is expected, not early.
//
// `note(required)` keeps the figure on screen where there is one, so holding off
// on the verdict never costs the Resource Manager the number they are staffing
// towards.
const WAITING_EMPTY = {
  manpower: {
    label: () => 'Awaiting request',
    title: 'The manpower request for this stage hasn’t been submitted yet — assign someone now if you like, it counts as neither short nor excess.',
  },
  not_due: {
    label: (required) => (required > 0 ? `Not due yet · needs ${required}` : 'Not due yet'),
    title: 'This step isn’t due yet — assign people in advance if you like; nothing is counted until it opens.',
  },
  carry_over: {
    label: () => 'Carries over',
    title: 'The Execution Red from the previous stage will be assigned when this step opens — or press the suggestion below to do it now.',
  },
}

// A slot this step doesn't staff. The two allocation task kinds are disjoint
// (team = Red/Brown/White/+members, auditor = Auditors 1–4), so most rows have
// several of these — a muted dash, so the two kinds still read as one table.
function NotStaffed({ label }) {
  return (
    <span className="text-muted-foreground" title={`This step does not staff ${label}`}>
      —
    </span>
  )
}

// The people-picker itself.
//
// DD-R22-2: the trigger shows the holder's name as **plain text read off the
// allocation row**, not via a matched `<SelectItem>`, and the user list is
// fetched the first time this particular picker is opened. A 20-row queue with
// four picker columns would otherwise fire ~80 people-lookups on load, for lists
// nobody has opened — while the names, which the row must show immediately, are
// already in the task payload.
function PeoplePicker({ taskId, slot, value, display, disabled, exclude, onPick, label, className }) {
  const [opened, setOpened] = useState(false)
  const { data: users = [], isLoading } = useAllocationUsers({
    taskId: opened ? taskId : null,
    slot,
  })
  const options = exclude ? users.filter((u) => !exclude.has(u.id)) : users

  return (
    <Select
      value={value || ''}
      disabled={disabled}
      onOpenChange={(open) => open && setOpened(true)}
      onValueChange={(v) => {
        if (v === NONE) return
        const id = Number(v)
        onPick(id, options.find((u) => u.id === id)?.name)
      }}
    >
      {/* The column header names the slot, which a screen reader following the
          table won't read out again on the control itself. */}
      <SelectTrigger aria-label={label} className={cn('w-full min-w-[9rem]', className)}>
        {display}
      </SelectTrigger>
      <SelectContent position="popper">
        {isLoading && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading people…</div>
        )}
        {!isLoading && options.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">Nobody available</div>
        )}
        {options.map((u) => (
          <SelectItem key={u.id} value={String(u.id)}>
            {u.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// The mutations for the whole page, called **once** by the host rather than per
// row. Each handler is a save with no Save button behind it, so each one
// confirms with a toast — allocate and release used to be silent, which in a
// table reads as "nothing happened" (R22-4).
export function useAllocationActions() {
  const allocate = useAllocateSlot()
  const reassign = useReassignSlot()
  const release = useReleaseSlot()

  return {
    async allocate(taskId, slot, userId, name) {
      try {
        await allocate.mutateAsync({ taskId, slot, userId })
        toast.success(name ? `${name} assigned` : 'Assigned')
      } catch (e) {
        toast.error(e.message)
      }
    },
    async reassign(taskId, allocationId, userId, name) {
      try {
        await reassign.mutateAsync({ taskId, allocationId, userId })
        toast.success(name ? `Reassigned to ${name}` : 'Reassigned')
      } catch (e) {
        toast.error(e.message)
      }
    },
    async release(taskId, allocationId, name) {
      try {
        await release.mutateAsync({ taskId, allocationId })
        toast.success(name ? `${name} released` : 'Slot released')
      } catch (e) {
        toast.error(e.message)
      }
    },
  }
}

// True when this allocation task has everything it needs to be submitted — i.e.
// an Execution Red, whose successor task is assigned to them (§7.5). Replaces
// `isRedMissing` at the call sites that only ever negated it.
export function isSubmittable(task) {
  const alloc = task.allocation || {}
  if (!(alloc.slots || []).includes('execution_red')) return true
  return !!(alloc.occupants?.execution_red || [])[0]
}

// One single-occupancy slot (Execution Red / Brown / an Auditor) in one cell:
// the holder's name, the picker that changes it, a release control where the
// slot may be emptied, and the carry-over suggestion where there is one.
export function SlotCell({ task, slot, actions, disabled, label: labelProp }) {
  const alloc = task.allocation || {}
  const label = labelProp || alloc.slot_labels?.[slot] || slot
  if (!(alloc.slots || []).includes(slot)) return <NotStaffed label={label} />

  const occupant = (alloc.occupants?.[slot] || [])[0]
  const name = occupant?.user_name?.name
  // R22-5: the previous stage's holder for this slot, sent by the serializer all
  // along and never rendered. The Red usually carries the whole engagement, so
  // this is the single most repeated keystroke on the screen.
  const suggestion = occupant ? null : alloc.prefill?.[slot]
  // R24: every judgement about this slot comes off one gate, so the four
  // staffing surfaces can't disagree about when a figure counts.
  const measure = slotMeasure(task, slot)
  const waiting = measure.status === 'waiting' ? WAITING_EMPTY[measure.waiting] : null
  // DD-R22-5: an unfilled slot that is *required* is amber (design.md's
  // under-allocation colour) so scanning a column finds the gaps; an unfilled
  // optional slot stays muted. R24 adds the third case — required, but not
  // against a figure that exists yet.
  const empty = waiting
    ? <span className="text-muted-foreground" title={waiting.title}>{waiting.label(measure.required)}</span>
    : measure.required > 0
      ? <span className="text-amber-700 dark:text-amber-400">
          {slot === 'execution_red' ? 'Required' : 'Not assigned'}
        </span>
      : <span className="text-muted-foreground">Optional</span>
  // R23-3d: a single-occupancy slot can only ever be "over" by being filled at
  // all when the upstream manpower approved none of it — an Execution Brown
  // staffed on a stage whose Task 2 answered "no manpower required". R24: only
  // when that "none" is a real answer. Before the request is submitted, and on
  // the R12 named extras (`required: 0` **by design**, PRD §5.7), `measured` is
  // false — otherwise every advance assignment and every optional name would
  // read as an over-allocation.
  const excess = !!occupant && measure.measured && measure.required === 0

  return (
    <div className="flex flex-col gap-1">
      {excess && (
        <span className="text-xs font-medium text-red-600" title="No manpower was approved for this slot upstream">
          Over — none approved
        </span>
      )}
      <div className="flex items-center gap-0.5">
        <PeoplePicker
          taskId={task.id}
          slot={slot}
          label={label}
          value={occupant?.user ? String(occupant.user) : ''}
          disabled={disabled}
          display={
            <span className="truncate" title={name || undefined}>
              {name ? <span className="font-medium">{name}</span> : empty}
            </span>
          }
          onPick={(userId, picked) =>
            occupant
              ? actions.reassign(task.id, occupant.id, userId, picked)
              : actions.allocate(task.id, slot, userId, picked)
          }
        />
        {/* The Red is mandatory and is changed by picking someone else, never
            emptied (DD-R9-9 — the backend rejects a Red release too). */}
        {occupant && !disabled && slot !== 'execution_red' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => actions.release(task.id, occupant.id, name)}
              >
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Release {label}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {suggestion && !disabled && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => actions.allocate(task.id, slot, suggestion.id, suggestion.name)}
            >
              <CornerDownRight className="size-3 shrink-0" />
              <span className="truncate">{suggestion.name}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Carried over from the previous stage — press to assign</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

// White is a pool: several people hold it at once, so the cell lists them and
// offers an "add" picker rather than a single value. Legacy pre-R14 "TBD" rows
// named nobody and are not people — filtered out, not shown as holders.
export function WhiteCell({ task, actions, disabled }) {
  const alloc = task.allocation || {}
  if (!(alloc.slots || []).includes('white')) return <NotStaffed label="White" />

  const rows = (alloc.occupants?.white || []).filter((o) => !o.is_tbd)
  const taken = new Set(rows.map((o) => o.user))
  // R24: `measured` is false until the stage's manpower request has been
  // submitted — Whites staffed in advance are neither short nor excess, because
  // `required` reads 0 for "not asked yet" as well as for "none approved".
  const measure = slotMeasure(task, 'white')
  const required = measure.required
  const waiting = measure.status === 'waiting' ? WAITING_EMPTY[measure.waiting] : null
  const short = measure.measured && required > 0 && rows.length < required
  // R23-3d: the White pool is the only slot that can hold more people than the
  // manpower approved upstream, and going over it was invisible until now
  // (Tech Req §4.7 — over is red, under amber).
  const over = measure.measured && rows.length > required
  const overBy = rows.length - required

  return (
    <div className="flex flex-col gap-1">
      {over && (
        <span
          className="text-xs font-medium text-red-600"
          title={`${rows.length} allocated against an approved manpower of ${required}`}
        >
          {overBy} over ({rows.length} of {required})
        </span>
      )}
      {rows.map((o) => (
        <div key={o.id} className="flex items-center gap-0.5">
          <span className="flex-1 truncate text-sm font-medium" title={o.user_name?.name}>
            {o.user_name?.name}
          </span>
          {!disabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => actions.release(task.id, o.id, o.user_name?.name)}
                >
                  <X className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Release {o.user_name?.name}</TooltipContent>
            </Tooltip>
          )}
        </div>
      ))}

      {disabled ? (
        rows.length === 0 && <span className="text-muted-foreground">—</span>
      ) : (
        <PeoplePicker
          taskId={task.id}
          slot="white"
          label="Add a White"
          value=""
          exclude={taken}
          onPick={(userId, picked) => actions.allocate(task.id, 'white', userId, picked)}
          display={
            <span
              className={cn(
                'truncate',
                short ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
              )}
              title={waiting?.title}
            >
              {short
                ? `Add White (${rows.length} of ${required})`
                : waiting ? `Add White (${waiting.label(required).toLowerCase()})`
                  : 'Add White'}
            </span>
          }
        />
      )}
    </div>
  )
}

// The R12 named extras — Auditors 3–4 and Project Members 1–10 — in a plain
// label-and-picker grid for the row that expands beneath. They are optional and
// the backend only sends them to a Resource Manager, so their mere presence
// means the viewer may fill them (DD-R22-1 keeps them out of the main columns:
// eleven more columns would double the table's width for slots rarely filled).
export function ExtraSlotsGrid({ task, slots, actions, disabled }) {
  const alloc = task.allocation || {}
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
      {slots.map((slot) => (
        <div key={slot} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {alloc.slot_labels?.[slot] || slot}
          </span>
          <SlotCell task={task} slot={slot} actions={actions} disabled={disabled} />
        </div>
      ))}
    </div>
  )
}

// How many of `slots` currently have someone in them — the "3 of 10" figure on
// the extras toggle.
export function filledSlotCount(task, slots) {
  const occupants = task.allocation?.occupants || {}
  return slots.filter((s) => (occupants[s] || []).length > 0).length
}
