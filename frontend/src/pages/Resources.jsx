import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, ExternalLink, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StageBadge, TaskStateBadge } from '@/components/shared/StatusBadge'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  useAllocationTasks,
  useAllocationUsers,
  useAllocateSlot,
  useReassignSlot,
  useReleaseSlot,
  useSubmitAllocationTask,
} from '@/hooks/useResources'

const NONE = '__none__'
const TBD = '__tbd__'

// Which slots hold at most one currently-allocated resource — the rest (White)
// is a pool that can carry several concurrent rows.
function isPool(slot) {
  return slot === 'white'
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
        {occupant && !disabled && (
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
      {slot === 'execution_red' && !occupant && (
        <p className="text-xs text-muted-foreground">Required to submit — the next task is assigned to them.</p>
      )}
    </div>
  )
}

// White is a pool: several people may be allocated at once, and a slot may be
// left "TBD" (to-be-decided) instead of naming someone (PRD §5.7).
function WhiteSlotControl({ required, occupants, users, disabled, onAllocate, onRelease }) {
  const [pick, setPick] = useState(NONE)
  const allocatedNames = occupants.filter((o) => !o.is_tbd)
  const tbdCount = occupants.filter((o) => o.is_tbd).length

  function add() {
    if (pick === NONE) return
    if (pick === TBD) onAllocate('white', null, true)
    else onAllocate('white', Number(pick))
    setPick(NONE)
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
        <div className="flex items-center gap-1.5">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="w-full"><SelectValue placeholder="— Add a White —" /></SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={TBD}>Leave as TBD</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" variant="outline" disabled={pick === NONE} onClick={add}>Add</Button>
        </div>
      )}
    </div>
  )
}

function AllocationDialog({ task, onClose }) {
  const allocate = useAllocateSlot()
  const reassign = useReassignSlot()
  const release = useReleaseSlot()
  const submit = useSubmitAllocationTask()
  const busy = allocate.isPending || reassign.isPending || release.isPending || submit.isPending

  const alloc = task.allocation || {}
  const slots = alloc.slots || []
  const singleSlots = alloc.single_occupancy_slots || []

  const [redSlot] = slots.filter((s) => s === 'execution_red')
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

  const disabled = !['open', 'pending'].includes(task.status)

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
  async function handleSubmit() {
    try {
      await submit.mutateAsync({ taskId: task.id })
      toast.success('Resources allocated — next task opened')
      onClose()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const redOccupant = (alloc.occupants?.execution_red || [])[0]
  const redMissing = redSlot && !redOccupant

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{task.task_name}</DialogTitle></DialogHeader>

        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">{task.lead_project_name}</span>
            <StageBadge stage={task.stage_code} />
            <TaskStateBadge status={task.status} />
          </div>
          <div className="text-muted-foreground">{task.lead_company_name}</div>
        </div>

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

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {!disabled && (
            <Button
              onClick={handleSubmit}
              disabled={busy || redMissing}
              title={redMissing ? 'Select an Execution Red first' : undefined}
            >
              Submit allocation
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function slotSummary(task) {
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

function AllocationRow({ task, onEdit }) {
  const summary = slotSummary(task)
  return (
    <TableRow className="cursor-pointer" onClick={onEdit}>
      <TableCell>
        <Link
          to={`/leads/${task.lead}`}
          className="inline-flex items-center gap-1 font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {task.lead_project_name}
          <ExternalLink className="size-3 text-muted-foreground" />
        </Link>
        <div className="text-xs text-muted-foreground">{task.lead_company_name}</div>
      </TableCell>
      <TableCell>
        {task.task_name}
        {task.is_hanging_task && <span className="ml-1.5 text-xs text-muted-foreground">(non-blocking)</span>}
      </TableCell>
      <TableCell><StageBadge stage={task.stage_code} /></TableCell>
      <TableCell><TaskStateBadge status={task.status} /></TableCell>
      <TableCell>{summary?.text || <span className="text-muted-foreground">Not staffed yet</span>}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          {summary?.over && (
            <Tooltip>
              <TooltipTrigger asChild><AlertTriangle className="size-4 text-red-600" /></TooltipTrigger>
              <TooltipContent>Over-allocated: more resources than required</TooltipContent>
            </Tooltip>
          )}
          {!summary?.over && summary?.under && (
            <Tooltip>
              <TooltipTrigger asChild><AlertTriangle className="size-4 text-amber-500" /></TooltipTrigger>
              <TooltipContent>Under-allocated: fewer resources than required</TooltipContent>
            </Tooltip>
          )}
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onEdit() }}>
            <Pencil className="size-4" /> {['open', 'pending'].includes(task.status) ? 'Staff' : 'View'}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'closed', label: 'Closed' },
]

// Resource-allocation screen (Tech Req §9.1 / PRD §5.7, R5 rebuild). One row
// per allocation task (3/10/17/18/24/25) rather than the old wide per-cycle
// row — staffing a task is now a set of per-slot actions (allocate / reassign
// / release), each an append-only history row (§4.7). Workable by the
// Resource Manager or the lead's Default BD Person (D12).
export default function Resources() {
  const [statusFilter, setStatusFilter] = useState('all')
  const { data: tasks = [], isLoading } = useAllocationTasks(
    statusFilter === 'all' ? {} : { status: statusFilter },
  )
  const [editingId, setEditingId] = useState(null)

  const sorted = useMemo(() => [...tasks].sort((a, b) => b.id - a.id), [tasks])
  const editing = sorted.find((t) => t.id === editingId) || null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Resource Allocation</h1>
          <p className="text-sm text-muted-foreground">
            Staff each allocation task's slots (Execution Red/Brown, White, Auditors). Reassigning a slot
            keeps the person it replaced in history — nothing is ever overwritten.
          </p>
        </div>
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={statusFilter === f.value ? 'default' : 'outline'}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <Card className="py-0">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Allocation task</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Slots (allocated/required)</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && sorted.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No allocation tasks yet.</TableCell></TableRow>
              )}
              {sorted.map((task) => (
                <AllocationRow key={task.id} task={task} onEdit={() => setEditingId(task.id)} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && <AllocationDialog task={editing} onClose={() => setEditingId(null)} />}
    </div>
  )
}
