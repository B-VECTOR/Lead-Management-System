import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, Check, ExternalLink, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AllocationStatusBadge } from '@/components/shared/StatusBadge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  useResourceAllocations,
  useAllocationUsers,
  useUpdateAllocation,
  useSubmitAllocation,
} from '@/hooks/useResources'

// Single-holder slots (one user each). Execution Red drives the next task's
// assignee. Browns and White are multi-select and handled separately.
const SINGLE_FIELDS = [
  ['auditor1', 'Auditor 1'],
  ['auditor2', 'Auditor 2'],
  ['auditor3', 'Auditor 3'],
  ['auditor4', 'Auditor 4'],
  ['project_member1', 'Project Member 1'],
  ['project_member2', 'Project Member 2'],
  ['project_member3', 'Project Member 3'],
  ['project_member4', 'Project Member 4'],
  ['project_member5', 'Project Member 5'],
  ['project_member6', 'Project Member 6'],
  ['project_member7', 'Project Member 7'],
  ['project_member8', 'Project Member 8'],
  ['project_member9', 'Project Member 9'],
  ['project_member10', 'Project Member 10'],
]

const NONE = '__none__'

// Open = resources actively tied up; Closed = freed up (auto-close rules).
// Colour is canonical (shared AllocationStatusBadge); this page shows Closed as
// "Freed" and adds a hint tooltip.
const STATUS_META = {
  Pending: { label: 'Pending', hint: 'Awaiting allocation' },
  Open: { label: 'Open', hint: 'Resources tied up' },
  Closed: { label: 'Freed', hint: 'Resources freed up' },
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, hint: '' }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span><AllocationStatusBadge status={status} label={meta.label} /></span>
      </TooltipTrigger>
      {meta.hint && <TooltipContent>{meta.hint}</TooltipContent>}
    </Tooltip>
  )
}

function UserSelect({ value, onChange, users, disabled, labelFor }) {
  const label = labelFor || ((u) => u.name)
  return (
    <Select value={value ? String(value) : NONE} onValueChange={(v) => onChange(v === NONE ? null : Number(v))} disabled={disabled}>
      <SelectTrigger className="w-full"><SelectValue placeholder="— None —" /></SelectTrigger>
      {/* `position="popper"` makes the dropdown render in the Radix popper
          wrapper so `isInPortalLayer` recognises an outside-click as landing in
          a portal layer — otherwise closing the dropdown also dismissed the
          whole AllocationDialog ("2 steps out"). */}
      <SelectContent position="popper">
        <SelectItem value={NONE}>— None (TBD) —</SelectItem>
        {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{label(u)}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

// Multi-select for White: a stage can need several. (Brown is single now.)
function MultiUserSelect({ value = [], onChange, users, disabled, labelFor }) {
  const [open, setOpen] = useState(false)
  const label = labelFor || ((u) => u.name)
  const selected = users.filter((u) => value.includes(u.id))
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  return (
    // `modal` so an outside click while the dropdown is open closes only the
    // dropdown — its own layer captures the click before it reaches the parent
    // AllocationDialog (which is portalled separately and would otherwise treat
    // the click as "outside" and dismiss the whole dialog).
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-auto min-h-9 w-full flex-wrap justify-start gap-1 py-1.5 font-normal"
        >
          {selected.length === 0 ? (
            <span className="text-muted-foreground">— None (TBD) —</span>
          ) : (
            selected.map((u) => (
              <Badge key={u.id} variant="secondary" className="gap-1">
                {u.name}
                {!disabled && (
                  <X
                    className="size-3 cursor-pointer opacity-70 hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); toggle(u.id) }}
                  />
                )}
              </Badge>
            ))
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search people…" />
          <CommandList>
            <CommandEmpty>No user found.</CommandEmpty>
            <CommandGroup>
              {users.map((u) => (
                <CommandItem key={u.id} value={u.name} onSelect={() => toggle(u.id)}>
                  <Check className={cn('mr-2 size-4', value.includes(u.id) ? 'opacity-100' : 'opacity-0')} />
                  {label(u)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Guard the allocation dialog against being dismissed by a click that actually
// landed inside a portalled popover/select layer (rendered outside the dialog's
// DOM node). A genuine click outside the dialog still closes it.
function isInPortalLayer(e) {
  const t = e.detail?.originalEvent?.target
  return !!(
    t &&
    t.closest?.(
      '[data-radix-popper-content-wrapper], [data-radix-select-content], [data-radix-select-viewport]',
    )
  )
}

function DetailRow({ label, value }) {
  if (!value) return null
  return <span>{label}: <b className="font-medium text-foreground">{value}</b></span>
}

function ManpowerLine({ label, required, allocated }) {
  const over = required > 0 && allocated > required
  return (
    <span>
      {label}: <b className={over ? 'text-red-600' : 'text-foreground'}>{allocated}</b>
      <span className="text-muted-foreground"> / {required}</span>
    </span>
  )
}

// Single-holder resource keys (in form order) for gathering prior assignees.
const SINGLE_KEYS = ['execution_red', 'execution_brown', ...SINGLE_FIELDS.map(([k]) => k)]

function AllocationDialog({ allocation, users, onClose }) {
  const update = useUpdateAllocation()
  const submit = useSubmitAllocation()
  const [singles, setSingles] = useState({})
  const [whites, setWhites] = useState([])
  const [remark, setRemark] = useState('')

  // Every allocation on this lead — used to flag people already assigned on an
  // earlier step so the RM can re-pick them without memorising names (#3). The
  // list endpoint is RM-scoped; on the first allocation there are no prior rows.
  const { data: leadAllocs = [] } = useResourceAllocations({ leadId: allocation?.lead })

  useEffect(() => {
    if (!allocation) return
    const next = {
      execution_red: allocation.execution_red || null,
      execution_brown: allocation.execution_brown || null,
    }
    for (const [key] of SINGLE_FIELDS) next[key] = allocation[key] || null
    setSingles(next)
    setWhites(allocation.whites || [])
    setRemark(allocation.remark || '')
  }, [allocation])

  // userId → set of allocation types they were previously assigned on (rows
  // other than this one). Drives the "(prev: 2HR)" dropdown hint.
  const priorByUser = useMemo(() => {
    const map = {}
    for (const row of leadAllocs) {
      if (row.id === allocation?.id) continue
      const ids = SINGLE_KEYS.map((k) => row[k]).filter(Boolean).concat(row.whites || [])
      for (const id of ids) {
        (map[id] ||= new Set()).add(row.type)
      }
    }
    return map
  }, [leadAllocs, allocation?.id])

  const labelFor = (u) => {
    const prev = priorByUser[u.id]
    return prev ? `${u.name} (prev: ${[...prev].join(', ')})` : u.name
  }

  if (!allocation) return null
  const readOnly = allocation.status === 'Closed'
  const isPending = allocation.status === 'Pending'
  const busy = update.isPending || submit.isPending
  const payload = { ...singles, whites, remark }

  const brownCount = singles.execution_brown ? 1 : 0
  const overBrown = allocation.man_power_brown > 0 && brownCount > allocation.man_power_brown
  const overWhite = allocation.man_power_white > 0 && whites.length > allocation.man_power_white
  const over = overBrown || overWhite
  // Live under-allocation hint (§4.7 v14) — amber, mirrors the backend flag.
  const underBrown = allocation.man_power_brown > 0 && brownCount < allocation.man_power_brown
  const underWhite = allocation.man_power_white > 0 && whites.length < allocation.man_power_white
  const under = underBrown || underWhite
  // Execution Red is mandatory — the next workflow task is assigned to them
  // (§7.5; the Phase-13 Brown/White-editor rule was rescinded in Phase 14a).
  const redMissing = !singles.execution_red
  const cannotAllocate = redMissing

  async function handleAllocate() {
    // Single CTA: save the form, then submit — which closes the allocation
    // task and opens the next workflow task for the chosen Execution Red.
    await update.mutateAsync({ id: allocation.id, patch: payload })
    await submit.mutateAsync({ id: allocation.id })
    toast.success('Resources allocated — next task opened')
    onClose()
  }

  async function handleUpdate() {
    await update.mutateAsync({ id: allocation.id, patch: payload })
    toast.success('Allocation updated')
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        onPointerDownOutside={(e) => { if (isInPortalLayer(e)) e.preventDefault() }}
        onInteractOutside={(e) => { if (isInPortalLayer(e)) e.preventDefault() }}
      >
        <DialogHeader><DialogTitle>Allocate resources — {allocation.type}</DialogTitle></DialogHeader>

        {/* Lead / project context (PRD §5.7) so the RM can staff with clarity. */}
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">{allocation.lead_project_name}</span>
            <StatusBadge status={allocation.status} />
          </div>
          <div className="text-muted-foreground">{allocation.lead_company_name}</div>
          <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            <DetailRow label="Lead ID" value={allocation.lead_display_id} />
            <DetailRow label="Project ID" value={allocation.lead_project_id} />
            <DetailRow label="Lead Manager" value={allocation.lead_manager?.name} />
            <DetailRow label="Country" value={allocation.lead_country} />
            <DetailRow label="Industry" value={allocation.lead_industry} />
            <DetailRow label="Domain" value={allocation.lead_domain} />
            <DetailRow label="Division" value={allocation.lead_division} />
            <DetailRow label="Scope" value={allocation.lead_scope} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 border-t pt-2 text-xs">
            <span className="font-medium text-muted-foreground">Man-power (allocated / required):</span>
            <ManpowerLine label="Brown" required={allocation.man_power_brown} allocated={brownCount} />
            <ManpowerLine label="White" required={allocation.man_power_white} allocated={whites.length} />
          </div>
          {over && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
              <AlertTriangle className="size-3.5" />
              {overBrown && overWhite ? 'Brown and White exceed' : overBrown ? 'Brown exceeds' : 'White exceeds'} the required man-power.
            </p>
          )}
          {!over && under && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <AlertTriangle className="size-3.5" />
              {underBrown && underWhite ? 'Brown and White are below' : underBrown ? 'Brown is below' : 'White is below'} the required man-power.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Execution Red <span className="text-red-500">*</span> <span className="text-muted-foreground">(next task is assigned to them)</span></Label>
            <UserSelect value={singles.execution_red} users={users} disabled={readOnly} labelFor={labelFor} onChange={(v) => setSingles((s) => ({ ...s, execution_red: v }))} />
            {!readOnly && redMissing && <p className="text-xs text-red-600">Execution Red is required to allocate.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Execution Brown {allocation.man_power_brown > 0 && <span className="text-muted-foreground">(need {allocation.man_power_brown})</span>}</Label>
            <UserSelect value={singles.execution_brown} users={users} disabled={readOnly} labelFor={labelFor} onChange={(v) => setSingles((s) => ({ ...s, execution_brown: v }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">White {allocation.man_power_white > 0 && <span className="text-muted-foreground">(need {allocation.man_power_white})</span>}</Label>
            <MultiUserSelect value={whites} users={users} disabled={readOnly} labelFor={labelFor} onChange={setWhites} />
          </div>
          {SINGLE_FIELDS.map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label className="text-xs">{label}</Label>
              <UserSelect value={singles[key]} users={users} disabled={readOnly} labelFor={labelFor} onChange={(v) => setSingles((s) => ({ ...s, [key]: v }))} />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Remark</Label>
          <Textarea value={remark} disabled={readOnly} onChange={(e) => setRemark(e.target.value)} rows={2} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {!readOnly && (
            isPending ? (
              <Button onClick={handleAllocate} disabled={busy || cannotAllocate} title={redMissing ? 'Select an Execution Red first' : undefined}>Allocate resources</Button>
            ) : (
              <Button onClick={handleUpdate} disabled={busy}>Update allocation</Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Resource Manager reporting screen (Tech Req §9.1 / PRD §5.7) — every
// allocation row with its status and an over-allocation indicator; Edit opens
// the allocation form with the full lead/project + man-power context.
export default function Resources() {
  const { data: allocations = [], isLoading } = useResourceAllocations()
  const { data: users = [] } = useAllocationUsers()
  const [editing, setEditing] = useState(null)

  const sorted = useMemo(
    () => [...allocations].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [allocations],
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Resource Allocation</h1>
        <p className="text-sm text-muted-foreground">
          Allocate resources for each workflow stage. <b>Open</b> = resources tied up; <b>Freed</b> = released automatically as engagements finish.
        </p>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Man-power (allocated / required)</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && sorted.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No resource allocations yet.</TableCell></TableRow>
              )}
              {sorted.map((a) => (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => setEditing(a)}>
                  <TableCell>
                    <Link to={`/leads/${a.lead}`} className="inline-flex items-center gap-1 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {a.lead_project_name}
                      <ExternalLink className="size-3 text-muted-foreground" />
                    </Link>
                    <div className="text-xs text-muted-foreground">{a.lead_company_name} · {a.lead_display_id}</div>
                  </TableCell>
                  <TableCell>{a.type}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell>
                    <span className={a.is_over_allocated ? 'font-medium text-red-600' : ''}>
                      Brown {a.brown_count}/{a.man_power_brown} · White {a.white_count}/{a.man_power_white}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {a.is_over_allocated && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangle className="size-4 text-red-600" />
                          </TooltipTrigger>
                          <TooltipContent>Over-allocated: more resources than required</TooltipContent>
                        </Tooltip>
                      )}
                      {!a.is_over_allocated && a.is_under_allocated && a.status === 'Open' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangle className="size-4 text-amber-500" />
                          </TooltipTrigger>
                          <TooltipContent>Under-allocated: fewer resources than the required man-power</TooltipContent>
                        </Tooltip>
                      )}
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setEditing(a) }}>
                        <Pencil className="size-4" /> {a.status === 'Closed' ? 'View' : 'Edit'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <AllocationDialog
          allocation={editing}
          users={users}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
